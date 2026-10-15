const pages = document.querySelectorAll(".nav-btn");

const paths = [
    "/dashboard.html",
    "/datasensor.html",
    "/action-history.html",
    "/profile.html"
];


pages.forEach((page, index) => {
    page.onclick = () => {
        if(window.location.pathname !== paths[index]){
            window.location.href = paths[index];
        }
    };
});