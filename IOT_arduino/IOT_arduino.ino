#include <Arduino.h>
#include<ESP8266WiFi.h>
#include<PubSubClient.h>
#include<DHT.h>
#include<ArduinoJson.h>

// const char* SSID = "cuyt2";
// const char* PASSWORD = "hehehehe";

// const char* SSID = "ATTT_Wi-Fi";
// const char* PASSWORD = "attt2026";

const char* SSID = "PTIT_WIFI_KTX";
const char* PASSWORD = "PTIT@33daimo";

const char* MQTT_HOST = "10.32.158.191";
const uint16_t MQTT_PORT = 2005;
const char* deviceId = "led";
String topicTelemetry = "iot/esp01/telemetry";
String topicCmdLed = "iot/esp01/led/set";
String topicLedStatus = "iot/esp01/led/status";
String lastWillTopic = "iot/esp01/status";

#define LIGHT_PIN A0
#define DHTPIN 14
#define DHTTYPE DHT11
#define LED_PIN 5
#define LED_PIN2 0
#define LED_PIN3 4
DHT dht(DHTPIN, DHTTYPE);
WiFiClient espClient;
PubSubClient mqtt(espClient);

struct Device {
  const char* name;
  uint8_t pin;
};

Device devices[] = {
  {"LED1", LED_PIN},
  {"LED2", LED_PIN2},
  {"LED3", LED_PIN3},
};

const int DEVICE_COUNT = sizeof(devices) / sizeof(devices[0]);

void ensureMqtt();
void onMqttMessage(char *topic, byte *payload, unsigned int length);
Device* findDevice(const char* name);
void publishAllDeviceStatus(const char* requestId);

void setup() {
  Serial.begin(115200);
  delay(500);
  
  for (int i = 0; i < DEVICE_COUNT; i++) {
    pinMode(devices[i].pin, OUTPUT);
    digitalWrite(devices[i].pin, LOW);
  }

  Serial.println("Đang kết nối WiFi");
  WiFi.begin(SSID, PASSWORD);
  while(WiFi.status() != WL_CONNECTED){
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nĐã kết nối WiFi");

  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setCallback(onMqttMessage);
  mqtt.setKeepAlive(5);
  mqtt.setSocketTimeout(5);
  dht.begin();
}

unsigned long lastPub = 0;

void loop() {
  if (WiFi.status() != WL_CONNECTED){
    Serial.println("Không tìm thấy WiFi, đang kết nối lại");
    WiFi.reconnect();
    delay(3000);
  }
  ensureMqtt();
  mqtt.loop();

  unsigned long now = millis();
  if (now - lastPub >= 2000){
    lastPub = now;
    float h = dht.readHumidity();
    float t = dht.readTemperature();
    int lightValue = 1024 - analogRead(LIGHT_PIN);

    if (isnan(h) || isnan(t)){
      Serial.println("Không đọc được từ DHT11");
      return;
    }

    String payload = String("{\"ts\":") + String((unsigned long)(millis()));
    payload += ",\"temp\":" + String(t, 2);
    payload += ",\"hum\":" + String(h, 2);
    payload += ",\"light\":" + String(lightValue);
    payload += ",\"device\":\"";
    payload += deviceId;
    payload += "\"";
    payload += ",\"devices\":[";
    for (int i = 0; i < DEVICE_COUNT; i++) {
      if (i > 0) {
        payload += ",";
      }
      payload += "{\"device\":\"";
      payload += devices[i].name;
      payload += "\",\"state\":\"";
      payload += digitalRead(devices[i].pin) ? "ON" : "OFF";
      payload += "\"}";
    }
    payload += "]}";

    boolean ok = mqtt.publish(topicTelemetry.c_str(), payload.c_str(), true);
    Serial.print(ok ? "Đã publish " : "Không publish được: ");
    Serial.println(payload);
  }
}

Device* findDevice(const char* name) {
  for (int i = 0; i < DEVICE_COUNT; i++) {
    if (strcmp(devices[i].name, name) == 0) {
      return &devices[i];
    }
  }
  return nullptr;
}

void publishAllDeviceStatus(const char* requestId){
  JsonDocument doc;
  doc["node"] = "esp01";
  doc["requestId"] = requestId;
  JsonArray arr = doc["devices"].to<JsonArray>();
  for (int i = 0; i < DEVICE_COUNT; i++){
    JsonObject item = arr.add<JsonObject>();
    item["device"] = devices[i].name;
    item["state"] = digitalRead(devices[i].pin) ? "ON" : "OFF";
  }
  String status;
  serializeJson(doc, status);
  mqtt.publish(topicLedStatus.c_str(), status.c_str(), true);
}

void ensureMqtt(){
  while(!mqtt.connected()){
    Serial.println("Đang kết nối MQTT");
    String clientId = "esp8266-" + String(ESP.getChipId(), HEX);

    if(mqtt.connect(clientId.c_str(), "anhnh", "anhnh", lastWillTopic.c_str(), 0, true, "offline")){
      Serial.println("Đã kết nối");
      mqtt.publish(lastWillTopic.c_str(), "online", true);
      mqtt.subscribe(topicCmdLed.c_str());
      mqtt.subscribe(topicLedStatus.c_str());
      Serial.println("Đã subscribe");
      Serial.print(topicCmdLed);
    }
    else{
      Serial.print(" failed, rc=");
      Serial.print(mqtt.state());
      Serial.println(" | retry in 2s");
      delay(2000);
    }
  }
}

void onMqttMessage(char* topic, byte* payload, unsigned int length) {
  JsonDocument doc;
  DeserializationError error = deserializeJson(doc, payload, length);
  if (error){
    Serial.println("Payload không hợp lệ");
    return;
  }
  
  if (String(topic) == topicLedStatus){
    JsonArray arr = doc["devices"].as<JsonArray>();
    for (JsonObject item : arr){
      const char* name = item["device"];
      const char* state = item["state"];
      Device *device = findDevice(name);

      if (device == nullptr){
        Serial.println("thiết bị không tồn tại");
        continue;
      }
      if (strcmp(state, "ON") == 0){
        digitalWrite(device->pin, HIGH);
      }
      else if(strcmp(state, "OFF") == 0){
        digitalWrite(device->pin, LOW);
      }
    }
    return;
  }

  if (String(topic) == topicCmdLed) {
    const char* name = doc["device"];
    const char* action = doc["action"];
    const char* requestId = doc["requestId"] | "";
    if(!name || !action){
      Serial.println("thiếu tên thiết bị hoặc hành động");
      return;
    }

    Device* device = findDevice(name);
    if (device == nullptr){
      Serial.println("thiết bị không tồn tại");
      return;
    }
    if (strcmp(action, "ON") == 0){
      digitalWrite(device->pin, HIGH);
    }
    else if (strcmp(action, "OFF") == 0){
      digitalWrite(device->pin, LOW);
    }
    else if (strcmp(action, "TOGGLE") == 0){
      digitalWrite(device->pin, !digitalRead(device->pin));
    }
    else {
      Serial.println("UNKNOWN COMMAND");
      return;
    }
    publishAllDeviceStatus(requestId);
  }
}
