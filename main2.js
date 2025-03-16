document.addEventListener('DOMContentLoaded', () => {
    console.log('main2.js loaded');
    // Fetch images from the same server API
    fetch('/api/images')
        .then(response => response.json())
        .then(images => {
            console.log('Fetched images:', images);
            // For index2.html, update slideshow if present
            const slide1 = document.getElementById('slide1');
            const titleOverlay1 = document.getElementById('title-overlay1');
            if (slide1 && images.length > 0) {
                slide1.src = images[0].url;
                if (titleOverlay1) titleOverlay1.innerText = images[0].title;
            }
        })
        .catch(err => console.error(err));

    // Socket connection example (if needed)
    const socket = io();
    socket.on('settingsUpdate', ({ speed, order }) => {
        localStorage.setItem('transitionTime', speed);
        localStorage.setItem('slideshowOrder', order);
        location.reload();
    });
});