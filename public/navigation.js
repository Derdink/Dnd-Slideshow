// Broadcast navigation events through the WebSocket
function broadcastNavigation(action) {
    // If socket.io is available, emit the navigation event
    if (typeof io !== 'undefined') {
        const socket = io();
        socket.emit('navigation', { action });
    }
}

// Navigation Functions
function nextImage() {
    broadcastNavigation('next');
    // If we're on the index page and have the slideshow function
    if (typeof window.nextImage === 'function') {
        window.nextImage();
    }
}

function prevImage() {
    broadcastNavigation('prev');
    // If we're on the index page and have the slideshow function
    if (typeof window.prevImage === 'function') {
        window.prevImage();
    }
}

// Initialize navigation controls
function initializeNavigation() {
    // Handle hover areas (index.html)
    const leftArea = document.querySelector('.hover-area.left');
    const rightArea = document.querySelector('.hover-area.right');
    if (leftArea) leftArea.addEventListener('click', prevImage);
    if (rightArea) rightArea.addEventListener('click', nextImage);

    // Handle header buttons (manage.html)
    const headerNextBtn = document.getElementById('headerNextBtn');
    const headerPrevBtn = document.getElementById('headerPrevBtn');
    if (headerNextBtn) headerNextBtn.addEventListener('click', nextImage);
    if (headerPrevBtn) headerPrevBtn.addEventListener('click', prevImage);
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', initializeNavigation);