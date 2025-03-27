// Initialize socket communication first
const socket = io();

// Verify socket connection
socket.on('connect', () => {
    console.log('Socket connected:', socket.id);
});

socket.on('connect_error', (error) => {
    console.error('Socket connection error:', error);
});

// Move order to global scope
const order = localStorage.getItem('slideshowOrder') || 'random';

// Make order globally available 
window.slideshowOrder = localStorage.getItem('slideshowOrder') || 'random';

// At the top of the file, add global variable
window.images = [];

// Add this helper function near the top with other helpers
function formatDateAdded(timestamp) {
    const now = Date.now();
    const diff = now - Number(timestamp);
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (hours < 24) {
        return `${hours} ${hours === 1 ? 'Hr' : 'Hrs'} ago`;
    } else if (days < 3) {
        return `${days} ${days === 1 ? 'Day' : 'Days'} ago`;
    } else {
        const date = new Date(Number(timestamp));
        const day = date.getDate().toString().padStart(2, '0');
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const year = date.getFullYear().toString().slice(-2);
        return `${day}/${month}/${year}`;
    }
}

// Add this near the top with other global variables
let selectedImageIds = new Set();
let imagesData = [];

// Add global sort variables so they are accessible in filterImagesBySelectedTags
let currentSortKey = null;
let currentSortDirection = 'asc';

// Add this function definition before it's first used
function fetchTags() {
    console.log('Fetching tags...');
    return fetch('/api/tags')
        .then(response => {
            console.log('Tag API response status:', response.status);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .then(tags => {
            try {
                // Filter and sort tags before displaying
                const filteredTags = tags
                    .filter(tag => tag && tag.name && tag.name.toLowerCase() !== 'all')
                    .sort((a, b) => a.name.localeCompare(b.name));

                displayTagsInManager(filteredTags);
                return filteredTags;
            } catch (err) {
                console.error('Error processing tags:', err);
                return [];
            }
        })
        .catch(err => {
            console.error('Error in fetchTags:', err);
            return [];
        });
}

// ======================
// SLIDESHOW FUNCTIONALITY (Index Page)
// ======================
if (document.getElementById('slide1')) {
    // Variables to store images and current index
    let images = [];
    let currentIndex = 0;
    let transitionTime = parseFloat(localStorage.getItem('transitionTime')) || 3;
    // Remove duplicate order declaration
    // const order = localStorage.getItem('slideshowOrder') || 'random';
    // Store interval and pause flag on window for global consistency
    window.slideshowInterval = null;
    window.slideshowPaused = false;

    // Elements for current and next slides
    let currentSlideElement = document.getElementById('slide1');
    let nextSlideElement = document.getElementById('slide2');
    let currentTitleOverlay = document.getElementById('title-overlay1');
    let nextTitleOverlay = document.getElementById('title-overlay2');
    let currentSubtitleOverlay = document.getElementById('subtitle-overlay1');
    let nextSubtitleOverlay = document.getElementById('subtitle-overlay2');

    // ======================
    // Shuffle Function
    // ======================
    // Fisher–Yates shuffle algorithm to randomize array
    function shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }

    // Add after other global variables
    let fullImageList = [];
    let usedRandomImages = new Set();

    // ======================
    // Fetch Images and Initialize Slideshow
    // ======================
    fetch('/api/images')
        .then(response => response.json())
        .then(data => {
            console.log('Received images data:', data[0]); // Log first image
            if (!data || !Array.isArray(data) || data.length === 0) {
                console.error('No valid images received');
                return;
            }
            
            images = [...data];
            fullImageList = [...data];
            window.images = [...data];
            window.slideshowImages = [...data];
            window.selectedSlideshowImages = [...data];

            if (window.slideshowOrder === 'alphabetical') {
                images.sort((a, b) => a.title.localeCompare(b.title));
            } else if (window.slideshowOrder === 'random') {
                shuffleArray(images);
            }

            if (currentSlideElement && images.length > 0) {
                currentSlideElement.src = images[currentIndex].url;
                if (currentTitleOverlay) {
                    currentTitleOverlay.innerText = images[currentIndex].title;
                    currentTitleOverlay.classList.add('active');
                }
                if (currentSubtitleOverlay) {
                    currentSubtitleOverlay.innerText = images[currentIndex].description || '';
                    currentSubtitleOverlay.classList.add('active');
                }
                
                // Only start slideshow if we have more than one image
                if (images.length > 1) {
                    startSlideshow();
                }
            }
        })
        .catch(err => console.error('Error fetching images:', err));

    // ======================
    // Crossfade to Next Image
    // ======================
    function crossfadeTo(index, list) {
        console.log('crossfadeTo called with:', {
            index,
            listLength: list?.length,
            order: window.slideshowOrder,
            hasImages: !!list
        });

        // Use fallback list if provided list is invalid
        const imageList = (list && Array.isArray(list) && list.length > 0) ? 
            list : 
            (window.selectedSlideshowImages || window.images || []);

        if (!imageList || !Array.isArray(imageList) || imageList.length === 0) {
            console.warn('No valid image list available');
            return;
        }

        // Ensure index is within bounds
        const safeIndex = ((index % imageList.length) + imageList.length) % imageList.length;
        const image = imageList[safeIndex];
        
        if (!image || !image.url) {
            console.warn('Invalid image object at index:', safeIndex);
            return;
        }

        // Proceed with transition
        nextSlideElement.src = image.url;
        if (nextTitleOverlay) {
            nextTitleOverlay.innerText = image.title || '';
        }
        if (nextSubtitleOverlay) {
            nextSubtitleOverlay.innerText = image.description || '';
        }

        nextSlideElement.onload = () => {
            nextSlideElement.classList.add('active');
            currentSlideElement.classList.remove('active');
            if (nextTitleOverlay && currentTitleOverlay) {
                nextTitleOverlay.classList.add('active');
                currentTitleOverlay.classList.remove('active');
            }
            if (nextSubtitleOverlay && currentSubtitleOverlay) {
                nextSubtitleOverlay.classList.add('active');
                currentSubtitleOverlay.classList.remove('active');
            }
            setTimeout(() => {
                let tempImg = currentSlideElement;
                currentSlideElement = nextSlideElement;
                nextSlideElement = tempImg;
                if (nextTitleOverlay && currentTitleOverlay) {
                    let tempTitle = currentTitleOverlay;
                    currentTitleOverlay = nextTitleOverlay;
                    nextTitleOverlay = tempTitle;
                }
                if (nextSubtitleOverlay && currentSubtitleOverlay) {
                    let tempSubtitle = currentSubtitleOverlay;
                    currentSubtitleOverlay = nextSubtitleOverlay;
                    nextSubtitleOverlay = tempSubtitle;
                }
            }, 1000);
        };
    }

    // ======================
    // Navigate to Next Image
    // ======================
    // NEW: Helper to group images by tag (each image may appear more than once)
    function groupOrderImages(imageList) {
        let tagSet = new Set();
        imageList.forEach(img => {
            img.tags.forEach(t => {
                const name = t.name.trim();
                if (name) tagSet.add(name);
            });
        });
        const sortedTags = Array.from(tagSet).sort((a, b) => a.localeCompare(b));
        if (sortedTags.length === 0) {
            alert("No group tags available. Please assign tags and try again.");
            return [];
        }
        let grouped = [];
        sortedTags.forEach(tagName => {
            let groupImages = imageList.filter(img =>
                img.tags.some(t => t.name.trim().toLowerCase() === tagName.toLowerCase())
            );
            // Sort each group alphabetically by image title
            groupImages.sort((a, b) => a.title.localeCompare(b.title));
            grouped = grouped.concat(groupImages);
        });
        return grouped;
    }

    // MODIFY nextImage to support 'groups' order
    function nextImage() {
        // Always use the full image list or selected images if available
        const imageList = (window.selectedSlideshowImages && window.selectedSlideshowImages.length > 0) ?
            window.selectedSlideshowImages :
            fullImageList;

        if (imageList.length === 0) {
            console.warn('No images available for navigation');
            return;
        }

        let newList = imageList;

        if (window.slideshowOrder === 'alphabetical') {
            newList.sort((a, b) => a.title.localeCompare(b.title));
            currentIndex = (currentIndex + 1) % newList.length;
        } else if (window.slideshowOrder === 'random') {
            // If we've shown all images, reset the tracking
            if (usedRandomImages.size >= newList.length) {
                usedRandomImages.clear();
                shuffleArray(newList);
            }

            // Find next unused image
            let nextIndex;
            do {
                nextIndex = Math.floor(Math.random() * newList.length);
            } while (usedRandomImages.has(newList[nextIndex].id));

            currentIndex = nextIndex;
            usedRandomImages.add(newList[currentIndex].id);
        } else if (window.slideshowOrder === 'groups') {
            const groupedList = groupOrderImages(newList);
            if (!groupedList.length) return; // Alert already thrown in helper
            newList = groupedList;
            currentIndex = (currentIndex + 1) % newList.length;
        }
        crossfadeTo(currentIndex, newList);
        resetSlideshowInterval();
    }

    // ======================
    // Navigate to Previous Image
    // ======================
    function prevImage() {
        const imageList = (window.selectedSlideshowImages && window.selectedSlideshowImages.length > 0) ?
            window.selectedSlideshowImages :
            fullImageList;

        if (imageList.length === 0) {
            console.warn('No images available for navigation');
            return;
        }

        currentIndex = (currentIndex - 1 + imageList.length) % imageList.length;

        // For random mode, track the previous image
        if (window.slideshowOrder === 'random') {
            usedRandomImages.add(imageList[currentIndex].id);
        }

        crossfadeTo(currentIndex, imageList);
        resetSlideshowInterval();
    }

    // ======================
    // Slideshow Interval Management
    // ======================
    // Start the slideshow
    function startSlideshow() {
        if (!window.slideshowPaused && !window.slideshowInterval) {
            console.log('Starting slideshow interval');
            window.slideshowInterval = setInterval(window.nextImage, transitionTime * 1000);
        }
    }

    // Reset the slideshow interval
    function resetSlideshowInterval() {
        if (window.slideshowInterval) {
            clearInterval(window.slideshowInterval);
            window.slideshowInterval = null;
        }
        if (!window.slideshowPaused) {
            const speed = window.transitionTime || parseFloat(localStorage.getItem('transitionTime')) || 3;
            window.slideshowInterval = setInterval(window.nextImage, speed * 1000);
        }
    }

    // Expose next and previous image functions to global scope
    window.nextImage = nextImage;
    window.prevImage = prevImage;
    window.startSlideshow = startSlideshow;
    window.crossfadeTo = crossfadeTo;
    window.images = images; // Make images array globally available
    window.currentIndex = currentIndex; // Make currentIndex globally available

    console.log('Initialized global slideshow functions:', {
        hasCrossfadeTo: typeof window.crossfadeTo === 'function',
        hasImages: Array.isArray(window.images),
        currentIndex: window.currentIndex
    });

    // ======================
    // Live Update on Storage Change
    // ======================
    window.addEventListener('storage', function(e) {
        // Update settings when changed
        if (e.key === 'settingsUpdate') {
            const transitionTime = parseFloat(localStorage.getItem('transitionTime')) || 3;
            const newOrder = localStorage.getItem('slideshowOrder') || window.slideshowOrder;
            console.log('Slideshow order changed:', {
                previousOrder: window.slideshowOrder,
                newOrder: newOrder
            });
            window.slideshowOrder = newOrder;
            
            if (window.slideshowInterval) {
                clearInterval(window.slideshowInterval);
                window.slideshowInterval = setInterval(window.nextImage, transitionTime * 1000);
            }
        }
        // Play specific image when triggered
        if (e.key === 'playImage') {
            const playData = JSON.parse(e.newValue);
            if (playData) {
                currentSlideElement.src = playData.url;
                if (currentTitleOverlay) {
                    currentTitleOverlay.innerText = playData.title;
                }
                clearInterval(window.slideshowInterval); // Stop the slideshow
                window.slideshowPaused = true; // NEW: set pause flag
            }
        }
    });

    // Make order available to navigation functions by defining it in this scope
    const order = localStorage.getItem('slideshowOrder') || 'random';

    // Modify the window.nextImage function to use the order from this scope
    window.nextImage = function() {
        const imageList = (window.selectedSlideshowImages && window.selectedSlideshowImages.length > 0) ?
            window.selectedSlideshowImages :
            images;
        let newList = imageList;
        if (window.slideshowOrder === 'alphabetical') {
            newList.sort((a, b) => a.title.localeCompare(b.title));
            currentIndex = (currentIndex + 1) % newList.length;
        } else if (window.slideshowOrder === 'random') {
            if (currentIndex < newList.length - 1) {
                currentIndex++;
            } else {
                shuffleArray(newList);
                currentIndex = 0;
            }
        } else if (window.slideshowOrder === 'groups') {
            const groupedList = groupOrderImages(newList);
            if (!groupedList.length) return;
            newList = groupedList;
            currentIndex = (currentIndex + 1) % newList.length;
        }
        // Emit navigation event to other clients
        socket.emit('navigation', { action: 'next', index: currentIndex });
        crossfadeTo(currentIndex, newList);
        resetSlideshowInterval();
    };

    window.prevImage = function() {
        const imageList = (window.selectedSlideshowImages && window.selectedSlideshowImages.length > 0) ?
            window.selectedSlideshowImages :
            images;
        currentIndex = (currentIndex - 1 + imageList.length) % imageList.length;
        // Emit navigation event to other clients
        socket.emit('navigation', { action: 'prev', index: currentIndex });
        crossfadeTo(currentIndex, imageList);
        resetSlideshowInterval();
    };

    // Replace or update the existing headerPlayBtn click handler
    document.addEventListener('DOMContentLoaded', () => {
        const headerPlayBtn = document.getElementById('headerPlayBtn');
        if (headerPlayBtn) {
            // Set initial state
            updatePlayPauseButton(!window.slideshowPaused);

            headerPlayBtn.addEventListener('click', () => {
                window.slideshowPaused = !window.slideshowPaused;
                console.log('Slideshow state updated:', {
                    paused: window.slideshowPaused,
                    hasInterval: !!window.slideshowInterval
                });

                if (window.slideshowPaused) {
                    if (window.slideshowInterval) {
                        clearInterval(window.slideshowInterval);
                        window.slideshowInterval = null;
                    }
                } else {
                    startSlideshow();
                }

                updatePlayPauseButton(!window.slideshowPaused);

                // Broadcast state change
                socket.emit('slideAction', {
                    action: window.slideshowPaused ? 'pause' : 'play'
                });
            });
        }
    });

    // Helper function to update button appearance
    function updatePlayPauseButton(isPlaying) {
        const headerPlayBtn = document.getElementById('headerPlayBtn');
        if (!headerPlayBtn) return;

        headerPlayBtn.innerHTML = isPlaying ?
            `<svg focusable="false" preserveAspectRatio="xMidYMid meet" fill="currentColor" width="32" height="32" viewBox="0 0 32 32" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 8V24H8V8h4m0-2H8A2 2 0 006 8V24a2 2 0 002 2h4a2 2 0 002-2V8a2 2 0 00-2-2zM24 8V24H20V8h4m0-2H20a2 2 0 00-2 2V24a2 2 0 002 2h4a2 2 0 002-2V8a2 2 0 00-2-2z"></path>
                <title>Pause</title>
            </svg>` :
            `<svg focusable="false" preserveAspectRatio="xMidYMid meet" fill="currentColor" width="32" height="32" viewBox="0 0 32 32" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
                <path d="M7,28a1,1,0,0,1-1-1V5a1,1,0,0,1,1.4819-.8763l20,11a1,1,0,0,1,0,1.7525l-20,11A1.0005,1.0005,0,0,1,7,28ZM8,6.6909V25.3088L24.9248,16Z"></path>
                <title>Play</title>
            </svg>`;
        headerPlayBtn.title = isPlaying ? "Pause" : "Play";
    }

    // Update socket event handler for slideAction
    socket.on('slideAction', ({ action }) => {
        window.slideshowPaused = action === 'pause';

        if (window.slideshowInterval) {
            clearInterval(window.slideshowInterval);
            window.slideshowInterval = null;
        }

        if (action === 'play') {
            startSlideshow();
        }

        updatePlayPauseButton(!window.slideshowPaused);
    });
}

// NEW: Global pagination variables for management page
let currentPage = 1;
let currentLimit = 20; // entries per page
let totalPages = 1;
// ======================
// MANAGE PAGE FUNCTIONALITY (Settings, Upload, Pictures, and Tag Management)
// ======================
if (document.getElementById('settingsSection')) {
    // ----- SETTINGS PANEL TOGGLE -----
    // In your HTML, remove the <summary> from #settings-details and add a separate header.
    // For example, your HTML should include:
    // <div id="manageHeader" style="display:flex; justify-content: space-between; align-items: center;">
    //   <h2 id="manageTitle">Manage</h2>
    //   <button id="settingsToggle">⚙️</button>
    // </div>
    // <details id="settings-details">... settings form and upload section ...</details>
    if (document.getElementById('dropArea')) {
        const dropArea = document.getElementById('dropArea');
        const fileInput = document.getElementById('fileInput');
        const selectFilesBtn = document.getElementById('selectFiles');

        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            dropArea.addEventListener(eventName, preventDefaults, false);
            document.body.addEventListener(eventName, preventDefaults, false);
        });

        function preventDefaults(e) {
            e.preventDefault();
            e.stopPropagation();
        }
        // Highlight drop area when files are dragged over it
        ['dragenter', 'dragover'].forEach(eventName => {
            dropArea.addEventListener(eventName, () => dropArea.classList.add('highlight'), false);
        });
        ['dragleave', 'drop'].forEach(eventName => {
            dropArea.addEventListener(eventName, () => dropArea.classList.remove('highlight'), false);
        });
        dropArea.addEventListener('drop', handleDrop, false);

        function handleDrop(e) {
            const dt = e.dataTransfer;
            const files = dt.files;
            handleFiles(files);
        }
        // "Select Files" button is now under the title in dropArea
        selectFilesBtn.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', () => {
            handleFiles(fileInput.files);
        });

        function handleFiles(files) {
            files = [...files];
            files.forEach(uploadFile);
        }

        function uploadFile(file) {
            const formData = new FormData();
            formData.append('file', file);
            const statusDiv = document.createElement('div');
            statusDiv.innerText = `Uploading ${file.name}...`;
            // Append status message inside the drop area
            dropArea.appendChild(statusDiv);
            fetch('/upload', {
                    method: 'POST',
                    body: formData
                })
                .then(response => response.json())
                .then(result => {
                    if (result.overwritePrompt) {
                        if (confirm(`${file.name} already exists. Overwrite?`)) {
                            const formDataOverwrite = new FormData();
                            formDataOverwrite.append('file', file);
                            formDataOverwrite.append('overwrite', 'true');
                            return fetch('/upload', {
                                method: 'POST',
                                body: formDataOverwrite
                            }).then(resp => resp.json());
                        } else {
                            return { message: `Skipped ${file.name}` };
                        }
                    }
                    return result;
                })
                .then(result => {
                    statusDiv.innerText = result.message;
                    setTimeout(() => {
                        statusDiv.classList.add('fade-out');
                        setTimeout(() => statusDiv.remove(), 500);
                    }, 5000);
                    fetchImages();
                })
                .catch(err => {
                    statusDiv.innerText = `Error uploading ${file.name}`;
                    console.error(err);
                });
        }
    }
    // Global set to keep track of selected image IDs

    // Ensure global imagesData is available for management page
    window.imagesData = [];

    // ----- PICTURES MANAGEMENT FUNCTIONALITY -----

    function sortImages(images) {
        if (!currentSortKey) return images;

        return [...images].sort((a, b) => {
            let valA = currentSortKey === 'tags' ? a.tags.map(t => t.name).join(', ') : a[currentSortKey] || '';
            let valB = currentSortKey === 'tags' ? b.tags.map(t => t.name).join(', ') : b[currentSortKey] || '';

            if (currentSortKey === 'dateAdded') {
                valA = new Date(Number(valA));
                valB = new Date(Number(valB));
            }

            const comparison = valA < valB ? -1 : valA > valB ? 1 : 0;
            return currentSortDirection === 'asc' ? comparison : -comparison;
        });
    }

    function updateSortIndicators() {
        document.querySelectorAll('#imageTable th.sortable').forEach(header => {
            const key = header.getAttribute('data-key');
            const baseText = header.getAttribute('data-label') || header.textContent.trim();

            if (key === currentSortKey) {
                const arrow = currentSortDirection === 'asc' ? '▲' : '▼';
                header.innerHTML = `${baseText} <span class="sort-arrow">${arrow}</span>`;
            } else {
                header.innerHTML = baseText;
            }
        });
    }

    // Replace all existing sortable header event listeners with this single unified one:
    document.querySelectorAll('#imageTable th.sortable').forEach(header => {
        header.addEventListener('click', () => {
            const key = header.getAttribute('data-key');

            // Toggle direction if same key, otherwise set new key with asc direction
            if (currentSortKey === key) {
                currentSortDirection = currentSortDirection === 'asc' ? 'desc' : 'asc';
            } else {
                currentSortKey = key;
                currentSortDirection = 'asc';
            }

            updateSortIndicators();
            filterImagesBySelectedTags();
        });
    });

    // // UPDATED sortImages: remove pagination dependencies; sort over entire array
    // function sortImages(images) {
    //     if (!currentSortKey) return images;
    //     return images.sort((a, b) => {
    //         const valA = currentSortKey === 'tags' ? a.tags.join(', ') : a[currentSortKey] || '';
    //         const valB = currentSortKey === 'tags' ? b.tags.join(', ') : b[currentSortKey] || '';
    //         if (currentSortKey === 'dateAdded') {
    //             return currentSortDirection === 'asc' ?
    //                 Number(valA) - Number(valB) :
    //                 Number(valB) - Number(valA);
    //         } else {
    //             const cmp = String(valA).localeCompare(String(valB));
    //             return currentSortDirection === 'asc' ? cmp : -cmp;
    //         }
    //     });
    // }

    // // Function to update sort indicators
    // function updateSortIndicators() {
    //     document.querySelectorAll('#imageTable th.sortable').forEach(header => {
    //         let baseText = header.getAttribute('data-label');
    //         if (!baseText) {
    //             baseText = header.textContent.replace(/[▲▼]/g, '').trim();
    //             header.setAttribute('data-label', baseText);
    //         }
    //         if (header.getAttribute('data-key') === currentSortKey) {
    //             const arrow = currentSortDirection === 'asc' ? ' ▲' : ' ▼';
    //             header.innerHTML = baseText + `<span class="sort-arrow">${arrow}</span>`;
    //         } else {
    //             header.innerHTML = baseText;
    //         }
    //     });
    // }

    // // Event listener for sortable headers
    // document.querySelectorAll('#imageTable th.sortable').forEach(header => {
    //     header.addEventListener('click', () => {
    //         const key = header.getAttribute('data-key');
    //         if (currentSortKey === key) {
    //             currentSortDirection = currentSortDirection === 'asc' ? 'desc' : 'asc';
    //         } else {
    //             currentSortKey = key;
    //             currentSortDirection = 'asc';
    //         }
    //         updateSortIndicators();
    //         fetchImages();
    //     });
    // });

    // ======================
    // FETCH AND DISPLAY IMAGES
    // ======================


    // UPDATED fetchImages: apply pagination and then update pagination controls
    function fetchImages() {
        fetch('/api/images')
            .then(response => response.json())
            .then(data => {
                if (data.length > 0) {
                    console.log('Sample image data from API:', {
                        id: data[0].id,
                        title: data[0].title,
                        description: data[0].description,
                        hasDescriptionProperty: 'description' in data[0]
                    });
                    const sortedImages = sortImages(data);
                    displayImages(sortedImages); // or update your table with sortedImages
                }
                window.imagesData = data;
                filterImagesBySelectedTags();
                updatePagination(window.imagesData.length);
            })
            .catch(err => console.error("Error fetching images:", err));
    }

    // Function to display images in the table
    function displayImages(images) {
        const imageTableBody = document.querySelector('#imageTable tbody');
        imageTableBody.innerHTML = '';

        // Create IntersectionObserver for lazy loading
        const imageObserver = new IntersectionObserver((entries, observer) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const img = entry.target;
                    // Start loading the image
                    img.src = img.dataset.src;
                    img.addEventListener('load', () => {
                        // Remove skeleton and show image
                        const skeleton = img.previousElementSibling;
                        if (skeleton) skeleton.remove();
                        img.classList.add('loaded');
                    });
                    observer.unobserve(img);
                }
            });
        }, {
            rootMargin: '50px 0px',
            threshold: 0.1
        });

        images.forEach(image => {
            const tr = document.createElement('tr');
            // Check if this image is selected and add selected class
            if (selectedImageIds.has(image.id)) {
                tr.classList.add('selected');
            }

            // Row click toggles selection (except in actions cell)
            tr.addEventListener('click', function(e) {
                if (e.target.closest('.col-actions')) return;
                const chk = tr.querySelector('.selectImage');
                chk.checked = !chk.checked;
                if (chk.checked) {
                    selectedImageIds.add(image.id);
                } else {
                    selectedImageIds.delete(image.id);
                }
                tr.classList.toggle('selected', chk.checked);
                updateHeaderSelect();
            });

            // Checkbox cell with custom checkbox
            const selectCell = document.createElement('td');
            selectCell.classList.add('col-select');
            const checkboxLabel = document.createElement('label');
            checkboxLabel.classList.add('custom-checkbox');
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.classList.add('selectImage');
            checkbox.value = image.id;
            // Check if this image is selected
            checkbox.checked = selectedImageIds.has(image.id);
            if (selectedImageIds.has(image.id)) {
                checkbox.checked = true;
                tr.classList.add('selected');
            }
            checkbox.addEventListener('change', function() {
                const imageId = parseInt(image.id);
                if (this.checked) {
                    selectedImageIds.add(imageId);
                } else {
                    selectedImageIds.delete(imageId);
                }
                tr.classList.toggle('selected', this.checked);
                updateHeaderSelect();
            });
            const checkmarkSpan = document.createElement('span');
            checkmarkSpan.classList.add('checkmark');
            checkboxLabel.appendChild(checkbox);
            checkboxLabel.appendChild(checkmarkSpan);
            selectCell.appendChild(checkboxLabel);
            tr.appendChild(selectCell);

            // Thumbnail cell with skeleton loader
            const thumbCell = document.createElement('td');
            thumbCell.classList.add('col-thumb');

            // Add skeleton loader
            const skeleton = document.createElement('div');
            skeleton.classList.add('thumbnail-skeleton');
            thumbCell.appendChild(skeleton);

            // Create thumbnail with lazy loading
            const thumb = document.createElement('img');
            thumb.className = 'thumbnail';
            thumb.alt = image.title;
            thumb.dataset.src = image.thumbnailUrl || image.url; // Store URL for lazy loading
            imageObserver.observe(thumb);
            thumbCell.appendChild(thumb);
            tr.appendChild(thumbCell);

            // Name cell
            const nameCell = document.createElement('td');
            nameCell.classList.add('col-name');
            nameCell.textContent = image.title;
            tr.appendChild(nameCell);

            // Tags cell with tag-pill spans (filter out "all")
            const tagsCell = document.createElement('td');
            tagsCell.classList.add('col-tags');
            image.tags.forEach(tag => {
                if (tag.name.trim().toLowerCase() !== 'all') {
                    const tagPill = document.createElement('div');
                    tagPill.classList.add('tag-pill');
                    const tagColor = tag.color ? tag.color : '#FF4081';
                    tagPill.style.setProperty('--pill-color', tagColor);
                    const contrast = getContentColorForBackground(tagColor);
                    tagPill.style.color = contrast;

                    // Create tagIcon with fixed width of 1em for image entries
                    const tagIcon = document.createElement('div');
                    tagIcon.classList.add('tagIcon');

                    // Create tagContents container with 80% opacity
                    const tagContents = document.createElement('span');
                    tagContents.classList.add('tagContents');
                    tagContents.style.opacity = '0.8';

                    // Create tagName span
                    const tagName = document.createElement('span');
                    tagName.classList.add('tagName');
                    tagName.textContent = tag.name.trim();

                    // Create tagClear container for delete button (removes tag from this image)
                    const tagClear = document.createElement('span');
                    tagClear.classList.add('tagClear');

                    const tagDeleteButton = document.createElement('button');
                    tagDeleteButton.type = 'button';
                    tagDeleteButton.classList.add('tagDeleteButton');
                    tagDeleteButton.innerHTML = `<svg focusable="false" preserveAspectRatio="xMidYMid meet" fill="${contrast}" width="16" height="16" viewBox="0 0 32 32" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
          <path d="M17.4141 16L24 9.4141 22.5859 8 16 14.5859 9.4143 8 8 9.4141 14.5859 16 8 22.5859 9.4143 24 16 17.4141 22.5859 24 24 22.5859 17.4141 16z"></path>
        </svg>`;
                    tagDeleteButton.addEventListener('click', (e) => {
                        e.stopPropagation();
                        // Remove this tag from the current image only (no alert)
                        fetch('/api/entries/tags', {
                                method: 'DELETE',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ ids: [image.id], tag: tag.name })
                            })
                            .then(() => fetchImages())
                            .catch(err => console.error(err));
                    });
                    tagClear.appendChild(tagDeleteButton);

                    // Assemble tagContents: tagName and tagClear
                    tagContents.appendChild(tagName);
                    tagContents.appendChild(tagClear);

                    // Clear any preset text then append tagIcon and tagContents to the pill
                    tagPill.innerHTML = '';
                    tagPill.appendChild(tagIcon);
                    tagPill.appendChild(tagContents);

                    tagsCell.appendChild(tagPill);
                }
            });
            tr.appendChild(tagsCell);

            // Date cell formatted as day/month/yy
            const dateCell = document.createElement('td');
            dateCell.classList.add('col-date');
            dateCell.textContent = formatDateAdded(image.dateAdded);
            tr.appendChild(dateCell);

            // Actions cell with delete and play buttons
            const actionsCell = document.createElement('td');
            actionsCell.classList.add('col-actions');
            actionsCell.style.textAlign = 'right';

            // Delete button (color set to var(--text-color))
            const deleteBtn = document.createElement('button');
            deleteBtn.innerHTML = `<svg focusable="false" preserveAspectRatio="xMidYMid meet" fill="var(--text-color)" width="24" height="24" viewBox="0 0 32 32" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 12H14V24H12zM18 12H20V24H18z"></path>
        <path d="M4 6V8H6V28a2 2 0 002 2H24a2 2 0 002-2V8h2V6zM8 28V8H24V28zM12 2H20V4H12z"></path>
      </svg>`;
            deleteBtn.classList.add('deleteBtn');
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (confirm(`Delete ${image.title}?`)) {
                    fetch(`/api/images/${image.id}`, { method: 'DELETE' })
                        .then(response => response.json())
                        .then(result => {
                            alert(result.message);
                            fetchImages();
                        })
                        .catch(err => console.error(err));
                }
            });
            actionsCell.appendChild(deleteBtn);

            // Play button – displays this image in the slideshow immediately without transitions
            const playBtn = document.createElement('button');
            playBtn.innerHTML = `<svg focusable="false" preserveAspectRatio="xMidYMid meet" fill="currentColor" width="24" height="24" viewBox="0 0 32 32" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><path d="M7,28a1,1,0,0,1-1-1V5a1,1,0,0,1,1.4819-.8763l20,11a1,1,0,0,1,0,1.7525l-20,11A1.0005,1.0005,0,0,1,7,28Z"></path></svg>`;
            playBtn.classList.add('playBtn');
            playBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                console.log('Play button clicked for image:', image);

                // Stop any existing slideshow
                clearInterval(window.slideshowInterval);
                window.slideshowPaused = false;

                // Create a minimal image object for playback
                const playImage = {
                    id: image.id,
                    url: image.url,
                    title: image.title,
                    description: image.description || ''
                };

                // Send only necessary data, using 'play' action to bypass hidden filter
                fetch('/api/updateSlideshow', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            action: 'play',
                            imageUrl: playImage.url,
                            title: playImage.title,
                            description: playImage.description
                        })
                    })
                    .then(response => response.json())
                    .then(data => console.log('Server response:', data))
                    .catch(err => console.error('Error in play button handler:', err));
            });

            actionsCell.appendChild(playBtn);

            // Replace the custom SVG edit button with a standard button:
            const editBtn = document.createElement('button');
            editBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
  <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1.003 1.003 0 0 0 0-1.42l-2.34-2.34a1.003 1.003 0 0 0-1.42 0l-1.83 1.83 3.75 3.75 1.84-1.82z"/>
</svg>`;
            editBtn.classList.add('editBtn');
            editBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                showEditModal(image);
            });
            actionsCell.appendChild(editBtn);

            tr.appendChild(actionsCell);
            imageTableBody.appendChild(tr);
        });

        updateHeaderSelect();
    }

    // Add search input event listener within manage page context
    const searchInput = document.getElementById('search');
    if (searchInput) {
        searchInput.addEventListener('input', function() {
            fetchImages();
        });
    }

    // Initial fetch of images
    fetchImages();

    updateHeaderSelect();
}

// NEW: Global variable to hold selected filter tags (for image table filtering)
let selectedFilterTags = [];

// NEW: Update the filter dropdown with tag pills from the server
function updateTagFilterDropdown() {
    fetch('/api/tags')
        .then(response => response.json())
        .then(tags => {
            // Filter out "all" and sort alphabetically
            tags = tags.filter(t => t.name.trim().toLowerCase() !== 'all').sort((a, b) => a.name.localeCompare(b.name));
            const container = document.getElementById('tagFilterDropdown');
            if (!container) return;
            // Clear previous items except the clear button (which we add later)
            container.innerHTML = "";
            tags.forEach(tag => {
                const pill = document.createElement('div');
                pill.classList.add('tag-pill');
                const tagColor = tag.color || '#FF4081';
                pill.style.setProperty('--pill-color', tagColor);
                pill.style.backgroundColor = tagColor;
                const contrastColor = getContentColorForBackground(tagColor);
                pill.style.color = contrastColor;
                pill.style.opacity = selectedFilterTags.includes(tag.name.toLowerCase()) ? "1" : "0.5";
                pill.style.cursor = "pointer";
                pill.style.marginRight = "0.3em";

                // Create inner structure matching #tagSelectionContainer
                const tagIcon = document.createElement('div');
                tagIcon.classList.add('tagIcon');
                tagIcon.style.width = '1em';

                // Create tagContents container with 80% opacity
                const tagContents = document.createElement('span');
                tagContents.classList.add('tagContents');
                tagContents.style.opacity = '0.8';

                // Create tagName span
                const tagName = document.createElement('span');
                tagName.classList.add('tagName');
                tagName.textContent = tag.name;

                // Create tagClear container for delete button
                const tagClear = document.createElement('span');
                tagClear.classList.add('tagClear');

                // Assemble tagContents: tagName and tagClear
                tagContents.appendChild(tagName);
                tagContents.appendChild(tagClear);

                // Clear any preset text then append tagIcon and tagContents to the pill
                pill.innerHTML = '';
                pill.appendChild(tagIcon);
                pill.appendChild(tagContents);

                // Toggle selection event listener
                pill.addEventListener('click', () => {
                    if (pill.getAttribute('data-disabled') === 'true') return;
                    const tagKey = tag.name.toLowerCase();
                    const idx = selectedFilterTags.indexOf(tagKey);
                    if (idx === -1) {
                        selectedFilterTags.push(tagKey);
                    } else {
                        selectedFilterTags.splice(idx, 1);
                    }
                    pill.style.opacity = selectedFilterTags.includes(tagKey) ? "1" : "0.5";
                    updateFilterAvailability();
                    filterImagesBySelectedTags();
                });
                container.appendChild(pill);
            });

            // Append a clear filter pill with an explicit id
            const clearBtn = document.createElement('div');
            clearBtn.id = "clearFilter";
            clearBtn.classList.add("tag-pill");
            clearBtn.style.backgroundColor = "#0f62fe";
            clearBtn.style.color = "#fff";
            clearBtn.style.cursor = "pointer";
            clearBtn.style.marginRight = "0.3em";
            const clearIcon = document.createElement('div');
            clearIcon.classList.add('tagIcon');
            const clearContents = document.createElement('span');
            clearContents.classList.add('tagContents');
            const clearName = document.createElement('span');
            clearName.classList.add('tagName');
            clearName.textContent = "Clear Filters";
            const clearEmpty = document.createElement('span');
            clearEmpty.classList.add('tagClear');
            clearContents.appendChild(clearName);
            clearContents.appendChild(clearEmpty);
            clearBtn.innerHTML = "";
            clearBtn.appendChild(clearIcon);
            clearBtn.appendChild(clearContents);
            clearBtn.addEventListener('click', () => {
                // Reset selectedFilterTags without re-rendering the entire dropdown
                selectedFilterTags = [];
                // Reset opacity on all pills (excluding clearBtn)
                document.querySelectorAll('#tagFilterDropdown .tag-pill').forEach(pill => {
                    if (pill.id !== 'clearFilter') {
                        pill.style.opacity = "0.5";
                    }
                });
                filterImagesBySelectedTags();
            });
            container.appendChild(clearBtn);
        })
        .catch(err => console.error(err));
}

// NEW: Disable filter pills that aren’t available among currently displayed images
function updateFilterAvailability() {
    // If no filters are active, make all tags available
    if (selectedFilterTags.length === 0) {
        document.querySelectorAll('#tagFilterDropdown .tag-pill').forEach(pill => {
            if (pill.id !== 'clearFilter') {
                pill.removeAttribute('data-disabled');
                pill.style.pointerEvents = "auto";
                pill.style.filter = "none";
                pill.style.opacity = "0.5";
            }
        });
        return;
    }

    // Otherwise, proceed with normal filter availability logic
    const availableTags = new Set();
    const filtered = window.imagesData.filter(image => {
        const imageTags = image.tags.map(t => t.name.toLowerCase());
        return selectedFilterTags.every(tag => imageTags.includes(tag));
    });
    filtered.forEach(image => {
        image.tags.forEach(t => availableTags.add(t.name.toLowerCase()));
    });

    document.querySelectorAll('#tagFilterDropdown .tag-pill').forEach(pill => {
        if (pill.id === "clearFilter") return;
        const tagName = pill.textContent.toLowerCase();
        if (availableTags.has(tagName)) {
            pill.removeAttribute('data-disabled');
            pill.style.pointerEvents = "auto";
            pill.style.filter = "none";
        } else {
            pill.setAttribute('data-disabled', 'true');
            pill.style.pointerEvents = "none";
            pill.style.filter = "grayscale(100%)";
        }
    });
}

// NEW: Filter images based on selected filter tags and update table
function filterImagesBySelectedTags() {
    let images = window.imagesData || [];
    const queryEl = document.getElementById('search');
    const query = queryEl ? queryEl.value.trim().toLowerCase() : '';

    // Get selected images first
    const selectedImages = images.filter(img => selectedImageIds.has(img.id));

    // Filter remaining unselected images based on search and tags
    let filteredImages = images.filter(img => {
        // Skip if already in selected images
        if (selectedImageIds.has(img.id)) return false;

        // Apply search filter (only for unselected images)
        if (query && !img.title.toLowerCase().includes(query)) return false;

        // Apply tag filters
        if (selectedFilterTags.length > 0) {
            const imageTags = img.tags.map(t => t.name.toLowerCase());
            if (!selectedFilterTags.every(tag => imageTags.includes(tag))) return false;
        }

        return true;
    });

    // Combine selected images with filtered results
    images = [...selectedImages, ...filteredImages];

    // If sorting is active, sort the combined images
    if (currentSortKey) {
        images = sortImages(images);
    }

    // Update pagination and display
    totalPages = Math.ceil(images.length / currentLimit) || 1;
    if (currentPage > totalPages) currentPage = totalPages;
    const pageEntries = images.slice((currentPage - 1) * currentLimit, currentPage * currentLimit);
    displayImages(pageEntries);
    updatePagination(images.length);

    // Always update tag availability to ensure proper reset when filters are cleared
    updateFilterAvailability();
}

// NEW: Toggle dropdown visibility on filter button click
document.addEventListener('DOMContentLoaded', () => {
    // Move these inside the settings form check
    if (document.getElementById('settingsSection')) {
        const filterBtn = document.getElementById('filterBtn');
        const filterTabsWrapper = document.getElementById('filterTabsWrapper');

        if (filterBtn && filterTabsWrapper) {
            filterBtn.addEventListener('click', () => {
                const isVisible = filterTabsWrapper.style.display === "block";
                filterTabsWrapper.style.display = isVisible ? "none" : "block";

                // Update tag filters only when showing the wrapper
                if (!isVisible) {
                    updateTagFilterDropdown();
                }
            });
        }

        // Add search input event listener here
        const searchInput = document.getElementById('search');
        if (searchInput) {
            searchInput.addEventListener('input', () => {
                filterImagesBySelectedTags();
            });
        }
    }
    // Initialize tag manager if it exists
    const tagManagerSection = document.getElementById('tagManagerSection');
    if (tagManagerSection) {
        console.log('Initializing tag manager');
        // Make sure the section starts hidden
        tagManagerSection.style.display = 'none';
        // Pre-fetch tags but keep the section hidden
        fetchTags()
            .then(tags => console.log(`Pre-loaded ${tags.length} tags`))
            .catch(err => console.error('Failed to pre-load tags:', err));
    }

    // Keep other DOMContentLoaded handlers that should run on all pages
    const leftArea = document.querySelector('.hover-area.left');
    const rightArea = document.querySelector('.hover-area.right');
    if (leftArea && typeof window.prevImage === 'function') {
        leftArea.addEventListener('click', () => window.prevImage());
    }
    if (rightArea && typeof window.nextImage === 'function') {
        rightArea.addEventListener('click', () => window.nextImage());
    }
});

// Remove the standalone search event listener
// document.getElementById('search').addEventListener('input', () => {
//     filterImagesBySelectedTags();
// });

// NEW: Pagination controls function
function updatePagination(totalEntries) {
    let container = document.getElementById('pagination');
    if (!container) {
        // Insert pagination container immediately after the image table
        const table = document.getElementById('imageTable');
        container = document.createElement('div');
        container.id = 'pagination';
        table.parentNode.insertBefore(container, table.nextSibling);
    }
    container.innerHTML = '';

    // Create First button with Carbon SkipBackOutline icon
    const firstBtn = document.createElement('button');
    firstBtn.disabled = (currentPage === 1);
    firstBtn.title = "First";
    firstBtn.innerHTML = `<svg focusable="false" preserveAspectRatio="xMidYMid meet" fill="currentColor" width="24" height="24" viewBox="0 0 32 32" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><path d="M27 28a.9975.9975,0 01-.501-.1348l-19-11a1 1 0 010-1.73l19-11A1 1 0 0128 5V27a1 1 0 01-1 1zM2 4H4V28H2z"></path><title>Skip back filled</title></svg>`;
    firstBtn.addEventListener('click', () => {
        currentPage = 1;
        fetchImages();
    });

    // Create Prev button with Carbon ChevronLeft icon
    const prevBtn = document.createElement('button');
    prevBtn.disabled = (currentPage === 1);
    prevBtn.title = "Previous";
    prevBtn.innerHTML = `<svg focusable="false" preserveAspectRatio="xMidYMid meet" fill="currentColor" width="24" height="24" viewBox="0 0 32 32" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><path d="M14 26L15.41 24.59 7.83 17 28 17 28 15 7.83 15 15.41 7.41 14 6 4 16 14 26z"></path><title>Arrow left</title></svg>`;
    prevBtn.addEventListener('click', () => {
        if (currentPage > 1) currentPage--;
        fetchImages();
    });

    // Create page selection dropdown
    const pageSelect = document.createElement('select');
    for (let i = 1; i <= totalPages; i++) {
        const opt = document.createElement('option');
        opt.value = i;
        opt.textContent = i;
        if (i === currentPage) opt.selected = true;
        pageSelect.appendChild(opt);
    }
    pageSelect.addEventListener('change', (e) => {
        currentPage = parseInt(e.target.value);
        fetchImages();
    });

    // Create Next button with Carbon ChevronRight icon
    const nextBtn = document.createElement('button');
    nextBtn.disabled = (currentPage === totalPages);
    nextBtn.title = "Next";
    nextBtn.innerHTML = `<svg focusable="false" preserveAspectRatio="xMidYMid meet" fill="currentColor" width="24" height="24" viewBox="0 0 32 32" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><path d="M18 6L16.57 7.393 24.15 15 4 15 4 17 24.15 17 16.57 24.573 18 26 28 16 18 6z"></path><title>Arrow right</title></svg>`;
    nextBtn.addEventListener('click', () => {
        if (currentPage < totalPages) currentPage++;
        fetchImages();
    });

    // Create Last button with Carbon SkipForwardOutline icon
    const lastBtn = document.createElement('button');
    lastBtn.disabled = (currentPage === totalPages);
    lastBtn.title = "Last";
    lastBtn.innerHTML = `<svg focusable="false" preserveAspectRatio="xMidYMid meet" fill="currentColor" width="24" height="24" viewBox="0 0 32 32" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><path d="M28 4H30V28H28zM5 28a1 1 0 01-1-1V5a1 1 0 011.501-.8652l19 11a1 1 0 010 1.73l-19 11A.9975.9975,0 015 28z"></path><title>Skip forward filled</title></svg>`;
    lastBtn.addEventListener('click', () => {
        currentPage = totalPages;
        fetchImages();
    });

    // Create a limit selection dropdown for entries per page
    const limitSelect = document.createElement('select');
    [20, 50, 100, 200].forEach(limit => {
        const opt = document.createElement('option');
        opt.value = limit;
        opt.textContent = limit;
        if (limit === currentLimit) opt.selected = true;
        limitSelect.appendChild(opt);
    });
    limitSelect.addEventListener('change', (e) => {
        currentLimit = parseInt(e.target.value);
        currentPage = 1;
        fetchImages();
    });

    // Append controls in correct order
    container.appendChild(firstBtn);
    container.appendChild(prevBtn);
    container.appendChild(pageSelect);
    container.appendChild(nextBtn);
    container.appendChild(lastBtn);
    container.appendChild(limitSelect);
}

// ======================
// HEADER SELECT MANAGEMENT
// ======================

// Update the function to handle one-item case correctly
function updateHeaderSelect() {
    const headerSelect = document.getElementById('headerSelect');
    if (!headerSelect) return;

    // Get current visible checkboxes and their values
    const currentCheckboxes = document.querySelectorAll('#imageTable tbody .selectImage');
    const currentValues = Array.from(currentCheckboxes).map(cb => parseInt(cb.value));

    if (currentCheckboxes.length === 0) {
        headerSelect.checked = false;
        headerSelect.indeterminate = false;
        return;
    }

    // Check if all visible checkboxes are part of selectedImageIds
    const allVisibleSelected = currentValues.every(value => selectedImageIds.has(value));
    const someVisibleSelected = currentValues.some(value => selectedImageIds.has(value));

    // Update header checkbox state
    headerSelect.checked = allVisibleSelected;
    headerSelect.indeterminate = !allVisibleSelected && someVisibleSelected;
}

// Update bindHeaderSelect to handle all images across all pages
function bindHeaderSelect() {
    const headerSelect = document.getElementById('headerSelect');
    if (!headerSelect) return;

    headerSelect.addEventListener('change', function() {
        if (this.checked) {
            // Select all images across all pages
            window.imagesData.forEach(img => selectedImageIds.add(img.id));
        } else {
            // Clear all selections
            selectedImageIds.clear();
        }

        // Update visible checkboxes
        const rowCheckboxes = document.querySelectorAll('#imageTable tbody .selectImage');
        rowCheckboxes.forEach(cb => {
            cb.checked = this.checked;
            const row = cb.closest('tr');
            if (row) {
                row.classList.toggle('selected', this.checked);
            }
        });

        // Reset indeterminate state
        headerSelect.indeterminate = false;
    });
}

// Replace the unconditional event listener with a null check
const bulkDeleteBtn = document.getElementById('bulkDelete');
if (bulkDeleteBtn) {
    bulkDeleteBtn.addEventListener('click', () => {
        const checkboxes = document.querySelectorAll('.selectImage:checked');
        if (checkboxes.length === 0) {
            alert('No images selected.');
            return;
        }
        if (!confirm('Are you sure you want to delete the selected images?')) return;
        const ids = Array.from(checkboxes).map(cb => cb.value);
        fetch('/api/images', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids })
            })
            .then(response => response.json())
            .then(result => {
                alert(result.message);
                fetchImages();
            })
            .catch(err => console.error(err));
    });
}

// Call this function on DOMContentLoaded:
document.addEventListener('DOMContentLoaded', bindHeaderSelect);

// Function to update slideshow settings
function updateSlideshowSettings() {
    const minutes = parseInt(document.getElementById('minutes').value) || 0;
    const seconds = parseInt(document.getElementById('seconds').value) || 0;
    const totalSeconds = (minutes * 60) + seconds;

    // Get the currently active order button
    const selectedOrderBtn = document.querySelector('.bx--btn-set .bx--btn--primary');
    let newOrder = window.slideshowOrder;  
    if (selectedOrderBtn) {
        newOrder = selectedOrderBtn.id.replace('order', '').toLowerCase();
        window.slideshowOrder = newOrder;
    }

    // Update local storage and window variable
    localStorage.setItem('transitionTime', totalSeconds);
    window.transitionTime = totalSeconds;

    // Update server and emit to all clients
    fetch('/api/updateSlideshow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: 'updateSettings',
            speed: totalSeconds,
            order: newOrder
        })
    })
    .then(() => {
        // Reset the slideshow interval with new speed
        if (window.slideshowInterval) {
            clearInterval(window.slideshowInterval);
            window.slideshowInterval = setInterval(window.nextImage, totalSeconds * 1000);
        }

        // Show save confirmation
        const saveMessage = document.getElementById('saveMessage');
        if (saveMessage) {
            saveMessage.innerText = 'Settings saved!';
            saveMessage.classList.add('visible');
            setTimeout(() => {
                saveMessage.classList.add('fade-out');
                setTimeout(() => saveMessage.classList.remove('visible', 'fade-out'), 500);
            }, 2000);
        }
    })
    .catch(err => console.error(err));
}

// Settings form submission
document.addEventListener('DOMContentLoaded', () => {
    const saveSettingsBtn = document.getElementById('saveSettingsBtn');
    if (saveSettingsBtn) {
        saveSettingsBtn.addEventListener('click', () => {
            updateSlideshowSettings();
            const saveMessage = document.getElementById('saveMessage');
            if (saveMessage) {
                saveMessage.innerText = 'Settings saved!';
                saveMessage.classList.add('visible');
                setTimeout(() => {
                    saveMessage.classList.add('fade-out');
                    setTimeout(() => {
                        if (saveMessage.parentNode) {
                            saveMessage.classList.remove('visible', 'fade-out');
                        }
                    }, 500);
                }, 5000);
            }
        });
    }

    // Initialize order buttons
    const orderButtons = ['orderAlphabetical', 'orderRandom', 'orderGroups'];
    const currentOrder = localStorage.getItem('slideshowOrder') || 'random';

    // Set initial active state
    orderButtons.forEach(btnId => {
        const btn = document.getElementById(btnId);
        if (btn) {
            if (btnId === `order${currentOrder.charAt(0).toUpperCase() + currentOrder.slice(1)}`) {
                btn.classList.remove('bx--btn--secondary');
                btn.classList.add('bx--btn--primary');
            }

            btn.addEventListener('click', () => {
                // Remove primary class from all buttons
                orderButtons.forEach(id => {
                    const button = document.getElementById(id);
                    if (button) {
                        button.classList.remove('bx--btn--primary');
                        button.classList.add('bx--btn--secondary');
                    }
                });

                // Add primary class to clicked button
                btn.classList.remove('bx--btn--secondary');
                btn.classList.add('bx--btn--primary');
            });
        }
    });

    // Initialize time inputs
    const savedTime = parseFloat(localStorage.getItem('transitionTime')) || 3;
    const minutes = Math.floor(savedTime / 60);
    const seconds = Math.floor(savedTime % 60);

    const minutesInput = document.getElementById('minutes');
    const secondsInput = document.getElementById('seconds');

    if (minutesInput) minutesInput.value = minutes;
    if (secondsInput) minutesInput.value = seconds;
});

// ---------------------
// TAG MANAGEMENT FUNCTIONALITY (Manage Page)
// ---------------------
if (document.getElementById('tagManagerToggle')) {
    const tagManagerToggle = document.getElementById('tagManagerToggle');
    // Set the innerHTML to the provided SVG
    tagManagerToggle.innerHTML = `<svg focusable="false" preserveAspectRatio="xMidYMid meet" fill="currentColor" width="24" height="24" viewBox="0 0 32 32" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><circle cx="14" cy="14" r="2"></circle><path d="M20,30a.9967.9967,0,0,1-.707-.293L8.5859,19A2.0126,2.0126,0,0,1,8,17.5859V10a2.002,2.002,0,0,1,2-2h7.5859A1.9864,1.9864,0,0,1,19,8.5859L29.707,19.293a.9994.9994,0,0,1,0,1.414l-9,9A.9967.9967,0,0,1,20,30ZM10,10v7.5859l10,10L27.5859,20l-10-10Z"></path><path d="M12,30H4a2.0021,2.0021,0,0,1-2-2V4A2.0021,2.0021,0,0,1,4,2H28a2.0021,2.0021,0,0,1,2,2v8H28V4H4V28h8Z"></path><title>Data definition</title></svg>`;

    // Toggle Tag Manager Visibility when clicked
    tagManagerToggle.addEventListener('click', function() {
        const managerSection = document.getElementById('tagManagerSection');
        const playlistManagerSection = document.getElementById('playlistManagerSection');
        const playlistManagerToggle = document.getElementById('playlistManagerToggle');
        const newTagForm = document.getElementById('newTagForm');
        const isVisible = window.getComputedStyle(managerSection).display !== 'none';

        // Close playlist manager if open
        if (playlistManagerSection) {
            playlistManagerSection.style.display = 'none';
            playlistManagerToggle.classList.remove('active');
        }

        if (isVisible) {
            managerSection.style.display = 'none';
            newTagForm.style.display = 'none';
            tagManagerToggle.classList.remove('active');
        } else {
            managerSection.style.display = 'flex';
            newTagForm.style.display = 'flex';
            tagManagerToggle.classList.add('active');
            fetchTags();
        }
    });
}

/**
 * Fetch all tags (excluding "all")
        })
        .then(tags => {
            console.log('Received tags:', tags);
            try {
                // Filter and sort tags before displaying
                const filteredTags = tags
                    .filter(tag => tag && tag.name && tag.name.toLowerCase() !== 'all')
                    .sort((a, b) => a.name.localeCompare(b.name));

                displayTagsInManager(filteredTags);
                return filteredTags;
            } catch (err) {
                console.error('Error processing tags:', err);
                return [];
            }
        })
        .catch(err => {
            console.error('Error in fetchTags:', err);
            return [];
        });
}

/**
 * Display tag pills in the tag manager
 * @param {Array} tags - Array of tag objects
 */
function displayTagsInManager(tags) {
    const container = document.getElementById('tagManagerSection');
    console.log('Starting displayTagsInManager:', {
        hasContainer: !!container,
        tags: tags,
        tagsLength: tags ? tags.length : 0
    });

    if (!container) {
        console.error('Tag manager section container not found');
        return;
    }

    // Clear existing tags but don't change display property
    container.innerHTML = '';

    if (!tags || !Array.isArray(tags)) {
        console.error('Invalid tags data:', tags);
        return;
    }

    console.log('Processing tags array:', tags);

    tags.forEach((tag, index) => {
        console.log(`Processing tag ${index}:`, tag);

        try {
            // Create pill container - DEFINE THIS FIRST
            const pill = document.createElement('div');
            pill.classList.add('tag-pill');
            const tagColor = tag.color || '#FF4081';
            pill.style.setProperty('--pill-color', tagColor);
            const contrast = getContentColorForBackground(tagColor);
            pill.style.color = contrast;

            // Create tag icon container with delete button
            const tagIcon = document.createElement('div');
            tagIcon.classList.add('tagIcon');

            // Create delete button and add to tagIcon
            const tagDeleteButton = document.createElement('button');
            tagDeleteButton.type = 'button';
            tagDeleteButton.classList.add('tagDeleteButton');
            tagDeleteButton.title = 'Delete tag from database';
            tagDeleteButton.innerHTML = `<svg focusable="false" preserveAspectRatio="xMidYMid meet" fill="${contrast}" width="16" height="16" viewBox="0 0 32 32" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><path d="M12 12H14V24H12zM18 12H20V24H18z"></path><path d="M4 6V8H6V28a2 2 0 002 2H24a2 2 0 002-2V8h2V6zM8 28V8H24V28zM12 2H20V4H12z"></path></svg>`;

            // Delete button click handler
            tagDeleteButton.addEventListener('click', (e) => {
                e.stopPropagation();
                console.log('Delete button clicked for tag:', tag.name);
                if (confirm(`Delete tag "${tag.name}" from the database? This will remove it from all entries.`)) {
                    fetch(`/api/tags/${tag.id}`, { method: 'DELETE' })
                        .then(response => response.json())
                        .then(result => {
                            console.log('Tag deleted:', result);
                            fetchTags().then(() => updateTagSelection());
                            fetchImages();
                        })
                        .catch(err => console.error('Error deleting tag:', err));
                }
            });

            // Add delete button to tagIcon
            tagIcon.appendChild(tagDeleteButton);

            // Create tag contents container
            const tagContents = document.createElement('span');
            tagContents.classList.add('tagContents');
            tagContents.style.opacity = '0.8';

            // Create tag name
            const tagName = document.createElement('span');
            tagName.classList.add('tagName');
            tagName.textContent = tag.name;

            // Create tagClear container for remove from entries button
            const tagClear = document.createElement('span');
            tagClear.classList.add('tagClear');

            // Add remove from entries button
            const tagRemoveButton = document.createElement('button');
            tagRemoveButton.type = 'button';
            tagRemoveButton.classList.add('tagDeleteButton');
            tagRemoveButton.title = 'Remove tag from selected images';
            tagRemoveButton.innerHTML = `<svg focusable="false" preserveAspectRatio="xMidYMid meet" fill="${contrast}" width="16" height="16" viewBox="0 0 32 32" aria-hidden="true"><path d="M24 9.4L22.6 8 16 14.6 9.4 8 8 9.4l6.6 6.6L8 22.6 9.4 24l6.6-6.6 6.6 6.6 1.4-1.4-6.6-6.6L24 9.4z"></path></svg>`;

            // Add remove handler
            tagRemoveButton.addEventListener('click', (e) => {
                e.stopPropagation();
                const selectedCheckboxes = document.querySelectorAll('.selectImage:checked');
                const ids = Array.from(selectedCheckboxes).map(cb => cb.value);
                if (ids.length > 0) {
                    fetch('/api/entries/tags', {
                            method: 'DELETE',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ ids: ids, tag: tag.name })
                        })
                        .then(() => {
                            fetchImages();
                            deselectAllImages();
                        })
                        .catch(err => console.error('Error removing tag from images:', err));
                }
            });

            // Add remove button to tagClear
            tagClear.appendChild(tagRemoveButton);

            // Assemble the pill structure
            tagContents.appendChild(tagName);
            tagContents.appendChild(tagClear);
            pill.appendChild(tagIcon);
            pill.appendChild(tagContents);

            // Click handler for the pill
            pill.addEventListener('click', (e) => {
                if (e.target.closest('.tagDeleteButton')) return;

                console.log('Tag pill clicked:', tag.name);
                const selectedCheckboxes = document.querySelectorAll('.selectImage:checked');
                const ids = Array.from(selectedCheckboxes).map(cb => cb.value);

                if (ids.length > 0) {
                    console.log('Adding tag to selected images:', ids);
                    fetch('/api/entries/tags', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ ids: ids, tag: tag.name })
                        })
                        .then(() => {
                            fetchImages();
                            deselectAllImages();
                        })
                        .catch(err => console.error('Error adding tag to images:', err));
                } else {
                    console.log('No images selected, showing edit modal');
                    showTagEditModal(tag);
                }
            });

            // Add the completed pill to the container
            container.appendChild(pill);
            console.log(`Successfully added tag pill for: ${tag.name}`);
        } catch (error) {
            console.error(`Error processing tag ${index}:`, error, tag);
        }
    });

    console.log(`Rendered ${tags.length} tags in manager`);
}

// NEW: Define correct arrays with background colors and corresponding content (text) colors.
const backgroundColors = [
    "#e0e0e0", "#dde1e6", "#e5e0df", "#ffd7d9", "#ffd6e8", "#e8daff",
    "#d0e2ff", "#bae6ff", "#9ef0f0", "#a7f0ba", "#FFD8BD", "#ffeeb1", "#D5FFBD"
];
const contentColors = [
    "#161616", "#121619", "#171414", "#a2191f", "#9f1853", "#6929c4",
    "#0043ce", "#00539a", "#005d5d", "#0e6027", "#d91313", "#f97d3f", "#265C34"
];

// NEW: Helper to return the matching content color for a given background color.
function getContentColorForBackground(bgColor) {
    const index = backgroundColors.findIndex(
        col => col.toLowerCase() === bgColor.toLowerCase()
    );
    return index !== -1 ? contentColors[index] : "#ffffff";
}

// NEW: Global variable to track the next tag color index for sequential assignment.
let nextTagColorIndex = 0;
let nextPlaylistColorIndex = 0; // Add playlist color index

// NEW: Add a global initialization to persist both color indices
nextTagColorIndex = localStorage.getItem('nextTagColorIndex');
nextPlaylistColorIndex = localStorage.getItem('nextPlaylistColorIndex');
if (nextTagColorIndex === null) {
    nextTagColorIndex = 0;
    localStorage.setItem('nextTagColorIndex', '0');
}
if (nextPlaylistColorIndex === null) {
    nextPlaylistColorIndex = 0;
    localStorage.setItem('nextPlaylistColorIndex', '0');
} else {
    nextPlaylistColorIndex = parseInt(nextPlaylistColorIndex, 10);
}

/**
 * New Tag Creation
 */
if (document.getElementById('newTagForm')) {
    document.getElementById('newTagForm').addEventListener('submit', function(e) {
        e.preventDefault();
        const tagName = document.getElementById('newTagName').value.trim();
        // Use the globally initialized nextTagColorIndex instead of re-reading it here
        const tagColor = backgroundColors[nextTagColorIndex];
        nextTagColorIndex = (nextTagColorIndex + 1) % backgroundColors.length;
        localStorage.setItem('nextTagColorIndex', nextTagColorIndex);
        if (!tagName) return;
        fetch('/api/tags', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: tagName, color: tagColor })
            })
            .then(response => response.json())
            .then(result => {
                // Removed alert(result.message);
                // If any entries are selected, add the tag to them (no alert)
                const selectedCheckboxes = document.querySelectorAll('.selectImage:checked');
                const ids = Array.from(selectedCheckboxes).map(cb => cb.value);
                if (ids.length > 0) {
                    fetch('/api/entries/tags', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ ids: ids, tag: tagName })
                        })
                        .then(response => response.json())
                        .then(res => {
                            // Removed alert(res.message);
                            fetchImages();
                            // Deselect all images after adding tags
                            deselectAllImages();
                        })
                        .catch(err => console.error(err));
                } else {
                    fetchImages();
                }
                fetchTags().then(() => updateTagSelection());
                document.getElementById('newTagForm').reset();
            })
            .catch(err => {
                console.error(err);
                // Optionally handle error without alerting
            });
    });
}

// Call this function on DOMContentLoaded:
document.addEventListener('DOMContentLoaded', bindHeaderSelect);

// --------------------
// Management Page: Play Select Button Handler
// --------------------
if (document.getElementById('playSelectBtn')) {
    document.getElementById('playSelectBtn').addEventListener('click', () => {
        // "imagesData" is assumed to be the global array of all images fetched earlier
        const selectedIds = Array.from(document.querySelectorAll('.selectImage:checked')).map(cb => cb.value);
        let playImages = [];
        const transitionTime = parseFloat(localStorage.getItem('transitionTime')) || 3;
        const order = localStorage.getItem('slideshowOrder') || 'random';

        if (selectedIds.length === 0 || selectedIds.length === window.imagesData.length) {
            // If none or all are selected, try to play images tagged "all"; fallback to all images
            playImages = window.imagesData.filter(img =>
                img.tags.some(t => t.name.toLowerCase() === 'all')
            );
            if (playImages.length === 0) {
                playImages = window.imagesData;
            }
        } else {
            playImages = window.imagesData.filter(img => selectedIds.includes(String(img.id)));
            const order = localStorage.getItem('slideshowOrder') || 'random';
            if (order === 'random') {
                playImages.sort((a, b) => a.title.localeCompare(b.title));
            } else if (order === 'alphabetical') {
                playImages.sort(() => Math.random() - 0.5);
            }
        }
        fetch('/api/updateSlideshow', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'playSelect',
                images: playImages,
                speed: transitionTime,
                order: order
            })
        }).catch(err => console.error(err));
    });
}

// UPDATED: Update tag selector for play functionality using same structure as tag manager including .tagClear span
function displayTagsInSelection(tags) {
    // Filter out "all" and sort alphabetically
    tags = tags.filter(t => t.name.trim().toLowerCase() !== 'all')
        .sort((a, b) => a.name.localeCompare(b.name));
    const container = document.getElementById('tagSelectionContainer');
    if (!container) return;
    container.innerHTML = ''; // Clear existing

    // Add Select All pill
    const selectAllPill = document.createElement('div');
    selectAllPill.classList.add('tag-pill');
    selectAllPill.style.backgroundColor = '#0f62fe';
    selectAllPill.style.color = '#fff';
    selectAllPill.style.cursor = 'pointer';
    selectAllPill.style.marginRight = '0.3em';

    const selectAllIcon = document.createElement('div');
    selectAllIcon.classList.add('tagIcon');
    const selectAllContents = document.createElement('span');
    selectAllContents.classList.add('tagContents');
    const selectAllName = document.createElement('span');
    selectAllName.classList.add('tagName');
    selectAllName.textContent = 'Select All';
    const selectAllClear = document.createElement('span');
    selectAllClear.classList.add('tagClear');
    selectAllContents.appendChild(selectAllName);
    selectAllContents.appendChild(selectAllClear);
    selectAllPill.appendChild(selectAllIcon);
    selectAllPill.appendChild(selectAllContents);

    // Add Clear All pill
    const clearAllPill = document.createElement('div');
    clearAllPill.classList.add('tag-pill');
    clearAllPill.style.backgroundColor = '#da1e28';
    clearAllPill.style.color = '#fff';
    clearAllPill.style.cursor = 'pointer';
    clearAllPill.style.marginRight = '0.3em';

    const clearAllIcon = document.createElement('div');
    clearAllIcon.classList.add('tagIcon');
    const clearAllContents = document.createElement('span');
    clearAllContents.classList.add('tagContents');
    const clearAllName = document.createElement('span');
    clearAllName.classList.add('tagName');
    clearAllName.textContent = 'Clear All';
    const clearAllClear = document.createElement('span');
    clearAllClear.classList.add('tagClear');
    clearAllContents.appendChild(clearAllName);
    clearAllContents.appendChild(clearAllClear);
    clearAllPill.appendChild(clearAllIcon);
    clearAllPill.appendChild(clearAllContents);

    // Add click handlers
    selectAllPill.addEventListener('click', () => {
        container.querySelectorAll('.tag-pill:not(:first-child):not(:nth-child(2))').forEach(pill => {
            pill.classList.add('selected');
            pill.style.opacity = "1";
        });
    });

    clearAllPill.addEventListener('click', () => {
        container.querySelectorAll('.tag-pill').forEach(pill => {
            pill.classList.remove('selected');
            pill.style.opacity = "0.5";
        });
    });

    // Add pills to container
    container.appendChild(selectAllPill);
    container.appendChild(clearAllPill);

    // Add the rest of the tag pills
    tags.forEach(tag => {
        const pill = document.createElement('div');
        pill.classList.add('tag-pill');
        pill.style.setProperty('--pill-color', tag.color || '#FF4081');
        pill.style.backgroundColor = tag.color || '#FF4081';
        // NEW: Use mapped content color
        pill.style.color = getContentColorForBackground(tag.color || '#FF4081');
        // Set default opacity for unselected tags
        pill.style.opacity = "0.5";

        // Create tag icon (empty placeholder)
        const tagIcon = document.createElement('div');
        tagIcon.classList.add('tagIcon');

        // Create tag contents container
        const tagContents = document.createElement('span');
        tagContents.classList.add('tagContents');

        // Create tagName element
        const tagName = document.createElement('span');
        tagName.classList.add('tagName');
        tagName.textContent = tag.name;

        // NEW: Create tagClear span (no delete button here)
        const tagClear = document.createElement('span');
        tagClear.classList.add('tagClear');

        // Assemble tagContents: tagName and tagClear
        tagContents.appendChild(tagName);
        tagContents.appendChild(tagClear);

        // Assemble the pill structure similar to tag manager
        pill.appendChild(tagIcon);
        pill.appendChild(tagContents);

        // Toggle selected state on click:
        pill.addEventListener('click', () => {
            // Toggle class
            if (pill.classList.contains('selected')) {
                pill.classList.remove('selected');
                pill.style.opacity = "0.5";
            } else {
                pill.classList.add('selected');
                pill.style.opacity = "1";
            }
        });
        container.appendChild(pill);
    });
}

// Update updateTagSelection to use the renamed function
function updateTagSelection() {
    fetch('/api/tags')
        .then(response => response.json())
        .then(tags => displayTagsInSelection(tags))
        .catch(err => console.error('Error updating tag selection:', err));
}

// MODIFY: In the Play tags button event listener, use selected tags for filtering.
// If none are selected play all images normally.
document.addEventListener('DOMContentLoaded', () => {
    const playTagsBtn = document.getElementById('playTagsBtn');
    if (playTagsBtn) {
        playTagsBtn.addEventListener('click', () => {
            const selectedPills = document.querySelectorAll('#tagSelectionContainer .tag-pill.selected');
            const selectedTagNames = Array.from(selectedPills).map(p => p.textContent.trim().toLowerCase());
            const transitionTime = parseFloat(localStorage.getItem('transitionTime')) || 3;
            const order = localStorage.getItem('slideshowOrder') || 'random';

            let playImages = selectedTagNames.length === 0 ?
                window.imagesData :
                window.imagesData.filter(img =>
                    img.tags.some(t => selectedTagNames.includes(t.name.trim().toLowerCase()))
                );

            // Send only necessary image data
            const lightImages = playImages.map(img => ({
                id: img.id,
                url: img.url,
                title: img.title,
                description: img.description
            }));

            fetch('/api/updateSlideshow', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'playSelect',
                    images: lightImages,
                    speed: transitionTime,
                    order: order
                })
            }).catch(err => console.error(err));
        });
    }
    // Ensure tag selection is synced.
    updateTagSelection();
});

// MODIFY: After any tag add or deletion in tag manager, call updateTagSelection to sync.
// For example, after fetchTags() in the tag manager, add:
// fetchTags().then(() => updateTagSelection());

document.addEventListener('DOMContentLoaded', () => {
    const leftArea = document.querySelector('.hover-area.left');
    const rightArea = document.querySelector('.hover-area.right');
    if (leftArea && typeof window.prevImage === 'function') {
        leftArea.addEventListener('click', () => window.prevImage());
    }
    if (rightArea && typeof window.nextImage === 'function') {
        rightArea.addEventListener('click', () => window.nextImage());
    }
});

// NEW: Pause Button Handler added in the Management Page section (after playSelectBtn listener)
document.addEventListener('DOMContentLoaded', () => {
    const pauseBtn = document.getElementById('pauseBtn');
    if (pauseBtn) {
        pauseBtn.addEventListener('click', () => {
            // If the slideshow container is missing, hide the pause button and exit.
            if (!document.getElementById('slide1')) {
                console.warn("Slideshow functionality not available on this page. Hiding pause button.");
                pauseBtn.style.display = 'none';
                return;
            }
            if (!window.slideshowPaused) {
                clearInterval(window.slideshowInterval);
                window.slideshowPaused = true;
                // Switch to play icon when paused
                pauseBtn.innerHTML = `<svg focusable="false" preserveAspectRatio="xMidYMid meet" fill="currentColor"
                    width="24" height="24" viewBox="0 0 32 32" aria-hidden="true">
                    <path d="M7,28a1,1,0,0,1-1-1V5a1,1,0,0,1,1.4819-.8763l20,11a1,1,0,0,1,0,1.7525l-20,11A1.0005,1.0005,0,0,1,7,28ZM8,6.6909V25.3088L24.9248,16Z"></path>
                  </svg>`;
            } else {
                window.slideshowPaused = false;
                // Use window.startSlideshow instead of startSlideshow
                window.startSlideshow();
                // Switch back to pause icon when resumed
                pauseBtn.innerHTML = `<svg focusable="false" preserveAspectRatio="xMidYMid meet" fill="currentColor"
                    width="24" height="24" viewBox="0 0 32 32" aria-hidden="true">
                        <path d="M10 6H14V26H10zM18 6H22V26H18z"></path>
                  </svg>`;
            }
        });
    }
});

// Move navigation functions to be globally available
window.nextImage = function() {
    // Ensure we have a valid image list
    const imageList = (window.selectedSlideshowImages && window.selectedSlideshowImages.length > 0) ?
        window.selectedSlideshowImages :
        window.images || [];

    if (imageList.length === 0) {
        console.warn('No images available for navigation');
        return;
    }

    let newCurrentIndex = window.currentIndex;

    if (window.slideshowOrder === 'alphabetical') {
        newCurrentIndex = (newCurrentIndex + 1) % imageList.length;
    } else if (window.slideshowOrder === 'random') {
        if (newCurrentIndex < imageList.length - 1) {
            newCurrentIndex++;
        } else {
            shuffleArray(imageList);
            newCurrentIndex = 0;
        }
    } else if (window.slideshowOrder === 'groups') {
        const groupedList = groupOrderImages(imageList);
        if (groupedList.length > 0) {
            window.currentIndex = (window.currentIndex + 1) % groupedList.length;
            window.selectedSlideshowImages = groupedList;
        } else {
            window.currentIndex = (window.currentIndex + 1) % imageList.length;
        }
    }

    // Update the global current index
    window.currentIndex = newCurrentIndex;

    // Emit navigation event to other clients
    socket.emit('navigation', {
        action: 'next',
        index: window.currentIndex
    });

    // Perform the transition
    crossfadeTo(window.currentIndex, window.selectedSlideshowImages);
    resetSlideshowInterval();
};

// Also update the prevImage function to match this pattern
window.prevImage = function() {
    const imageList = (window.selectedSlideshowImages && window.selectedSlideshowImages.length > 0) ?
        window.selectedSlideshowImages :
        window.images || [];

    if (imageList.length === 0) {
        console.warn('No images available for navigation');
        return;
    }

    window.currentIndex = (window.currentIndex - 1 + imageList.length) % imageList.length;

    // For random mode, track the previous image
    if (window.slideshowOrder === 'random') {
        usedRandomImages.add(imageList[window.currentIndex].id);
    }

    // Emit navigation event to other clients
    socket.emit('navigation', {
        action: 'prev',
        index: window.currentIndex
    });

    crossfadeTo(window.currentIndex, imageList);
    resetSlideshowInterval();
};

// Add event listeners for navigation controls
document.addEventListener('DOMContentLoaded', () => {
    // Handle header navigation buttons on manage.html
    const headerNextBtn = document.getElementById('headerNextBtn');
    const headerPrevBtn = document.getElementById('headerPrevBtn');

    console.log('Navigation buttons found:', {
        headerNextBtn: !!headerNextBtn,
        headerPrevBtn: !!headerPrevBtn
    });

    if (headerNextBtn) {
        headerNextBtn.addEventListener('click', () => {
            console.log('Next button clicked');
            triggerSlideshow('next');
        });
    }

    if (headerPrevBtn) {
        headerPrevBtn.addEventListener('click', () => {
            console.log('Prev button clicked');
            triggerSlideshow('prev');
        });
    }

    // Handle slideshow hover areas on index.html
    const leftArea = document.querySelector('.hover-area.left');
    const rightArea = document.querySelector('.hover-area.right');

    if (leftArea) {
        leftArea.addEventListener('click', () => {
            if (window.prevImage) window.prevImage();
        });
    }

    if (rightArea) {
        rightArea.addEventListener('click', () => {
            if (window.nextImage) window.nextImage();
        });
    }
});

// Add modal handling functions at the end of the file:
function showEditModal(image) {
    const modal = document.getElementById('editModal');
    modal.style.display = 'block';

    // Set the title value
    document.getElementById('editTitle').value = image.title || '';

    // Handle description, use existing description or empty string if null/undefined
    const description = image.description || '';
    document.getElementById('editDescription').value = description;

    // Store the image ID for the save operation
    modal.setAttribute('data-image-id', image.id);
}

function hideEditModal() {
    const modal = document.getElementById('editModal');
    modal.style.display = 'none';
}

// Attach modal event listeners when DOM is ready:
document.addEventListener('DOMContentLoaded', () => {
    const closeEditBtn = document.getElementById('closeEditBtn');
    const saveEditBtn = document.getElementById('saveEditBtn');

    if (closeEditBtn) {
        closeEditBtn.addEventListener('click', hideEditModal);
    }

    if (saveEditBtn) {
        saveEditBtn.addEventListener('click', () => {
            const modal = document.getElementById('editModal');
            if (!modal) return;

            const id = modal.getAttribute('data-image-id');
            const editTitle = document.getElementById('editTitle');
            const editDescription = document.getElementById('editDescription');

            if (!editTitle || !editDescription) return;

            const newTitle = editTitle.value.trim();
            const newDescription = editDescription.value.trim();

            fetch(`/api/images/${id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ title: newTitle, description: newDescription })
                })
                .then(response => response.json())
                .then(result => {
                    alert(result.message);
                    hideEditModal();
                    fetchImages();
                })
                .catch(err => console.error(err));
        });
    }
});

// NEW: Add at the top of the file
function triggerSlideshow(action) {
    console.log('triggerSlideshow called with action:', action);
    fetch('/api/updateSlideshow', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action })
        })
        .then(response => response.json())
        .then(data => {
            console.log('Server response:', data);
            // Handle the response locally if we're on manage.html
            if (document.getElementById('settingsSection')) {
                if (action === 'next') {
                    socket.emit('navigation', { action: 'next' });
                } else if (action === 'prev') {
                    socket.emit('navigation', { action: 'prev' });
                }
            }
        })
        .catch(err => console.error('Navigation error:', err));
}

// Modify the DOMContentLoaded event listener for manage.html navigation
document.addEventListener('DOMContentLoaded', () => {
    const headerNextBtn = document.getElementById('headerNextBtn');
    const headerPrevBtn = document.getElementById('headerPrevBtn');

    console.log('Header navigation buttons:', {
        nextFound: !!headerNextBtn,
        prevFound: !!headerPrevBtn
    });

    // Remove any existing click listeners
    if (headerNextBtn) {
        const newNextBtn = headerNextBtn.cloneNode(true);
        headerNextBtn.parentNode.replaceChild(newNextBtn, headerNextBtn);
        newNextBtn.addEventListener('click', () => {
            console.log('Next button clicked on manage page');
            triggerSlideshow('next');
        });
    }

    if (headerPrevBtn) {
        const newPrevBtn = headerPrevBtn.cloneNode(true);
        headerPrevBtn.parentNode.replaceChild(newPrevBtn, headerPrevBtn);
        newPrevBtn.addEventListener('click', () => {
            console.log('Prev button clicked on manage page');
            triggerSlideshow('prev');
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    // Attach event listeners to navigation arrows to fix the bug
    const leftArea = document.querySelector('.hover-area.left');
    const rightArea = document.querySelector('.hover-area.right');
    if (leftArea && typeof window.prevImage === 'function') {
        leftArea.addEventListener('click', () => window.prevImage());
    }
    if (rightArea && typeof window.nextImage === 'function') {
        rightArea.addEventListener('click', () => window.nextImage());
    }

    const headerResetBtn = document.getElementById('headerResetBtn');
    if (headerResetBtn) {
        headerResetBtn.addEventListener('click', () => {
            console.log('Reset button clicked');
            // Reset to first image in the current slideshow
            window.currentIndex = 0;
            const imageList = (window.selectedSlideshowImages && window.selectedSlideshowImages.length > 0) ?
                window.selectedSlideshowImages :
                window.images;

            if (imageList && imageList.length > 0) {
                crossfadeTo(0, imageList);
                socket.emit('navigation', { action: 'reset', index: 0 });
            }
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    // ...existing code...

    const headerPlayBtn = document.getElementById('headerPlayBtn');
    if (headerPlayBtn) {
        headerPlayBtn.addEventListener('click', () => {
            console.log('Play/Pause button clicked, current state:', {
                paused: window.slideshowPaused,
                hasInterval: !!window.slideshowInterval
            });

            // Function to handle play/pause state change
            const togglePlayPause = (shouldPause) => {
                window.slideshowPaused = shouldPause;

                // Always clear existing interval first
                if (window.slideshowInterval) {
                    clearInterval(window.slideshowInterval);
                    window.slideshowInterval = null;
                }

                // Start new interval if unpausing
                if (!shouldPause) {
                    const transitionTime = parseFloat(localStorage.getItem('transitionTime')) || 3;
                    window.slideshowInterval = setInterval(window.nextImage, transitionTime * 1000);
                }

                // Update button appearance
                headerPlayBtn.innerHTML = shouldPause ?
                    `<svg focusable="false" preserveAspectRatio="xMidYMid meet" fill="currentColor" width="32" height="32" viewBox="0 0 32 32" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><path d="M7,28a1,1,0,0,1-1-1V5a1,1,0,0,1,1.4819-.8763l20,11a1,1,0,0,1,0,1.7525l-20,11A1.0005,1.0005,0,0,1,7,28ZM8,6.6909V25.3088L24.9248,16Z"></path><title>Play</title></svg>` :
                    `<svg focusable="false" preserveAspectRatio="xMidYMid meet" fill="currentColor" width="32" height="32" viewBox="0 0 32 32" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><path d="M12 8V24H8V8h4m0-2H8A2 2 0 006 8V24a2 2 0 002 2h4a2 2 0 002-2V8a2 2 0 00-2-2zM24 8V24H20V8h4m0-2H20a2 2 0 00-2 2V24a2 2 0 002 2h4a2 2 0 002-2V8a2 2 0 00-2-2z"></path><title>Pause</title></svg>`;
                headerPlayBtn.title = shouldPause ? "Play" : "Pause";
            };

            // Toggle the state
            togglePlayPause(!window.slideshowPaused);

            // Broadcast state change to other clients
            socket.emit('slideAction', {
                action: window.slideshowPaused ? 'pause' : 'play'
            });
        });
    }
});

// Update socket.on handler to use the same logic
socket.on('slideAction', ({ action }) => {
    // ...existing code...

    if (action === 'pause') {
        window.slideshowPaused = true;
        if (window.slideshowInterval) {
            clearInterval(window.slideshowInterval);
            window.slideshowInterval = null;
        }
        const headerPlayBtn = document.getElementById('headerPlayBtn');
        if (headerPlayBtn) {
            headerPlayBtn.innerHTML = `
                <svg focusable="false" preserveAspectRatio="xMidYMid meet" fill="currentColor" width="32" height="32">
                    <path d="M7,28a1,1,0,0,1-1-1V5a1,1,0,0,1,1.4819-.8763l20,11a1,1,0,0,1,0,1.7525l-20,11A1.0005,1.0005,0,0,1,7,28ZM8,6.6909V25.3088L24.9248,16Z"></path>
                    <title>Play</title>
                </svg>`;
            headerPlayBtn.title = "Play";
        }
    } else if (action === 'play') {
        window.slideshowPaused = false;
        if (window.slideshowInterval) {
            clearInterval(window.slideshowInterval);
        }
        const transitionTime = parseFloat(localStorage.getItem('transitionTime')) || 3;
        window.slideshowInterval = setInterval(window.nextImage, transitionTime * 1000);
        const headerPlayBtn = document.getElementById('headerPlayBtn');
        if (headerPlayBtn) {
            headerPlayBtn.innerHTML = `
                <svg focusable="false" preserveAspectRatio="xMidYMid meet" fill="currentColor" width="32" height="32">
                    <path d="M12 8V24H8V8h4m0-2H8A2 2 0 006 8V24a2 2 0 002 2h4a2 2 0 002-2V8a2 2 0 00-2-2zM24 8V24H20V8h4m0-2H20a2 2 0 00-2 2V24a2 2 0 002 2h4a2 2 0 002-2V8a2 2 0 00-2-2z"></path>
                    <title>Pause</title>
                </svg>`;
            headerPlayBtn.title = "Pause";
        }
    }
});

// ...existing code...

// Add tab initialization to DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
    // ...existing code...

    // Initialize tabs
    const tabList = document.querySelector('.bx--tabs__nav');
    if (tabList) {
        const tabs = tabList.querySelectorAll('.bx--tabs__nav-item');
        const panels = document.querySelectorAll('.bx--tab-panel');

        tabs.forEach((tab, index) => {
            tab.addEventListener('click', () => {
                // Remove selected state from all tabs
                tabs.forEach(t => {
                    t.classList.remove('bx--tabs__nav-item--selected');
                    t.setAttribute('aria-selected', 'false');
                });

                // Add selected state to clicked tab
                tab.classList.add('bx--tabs__nav-item--selected');
                tab.setAttribute('aria-selected', 'true');

                // Hide all panels
                panels.forEach(panel => {
                    panel.hidden = true;
                    panel.setAttribute('aria-hidden', 'true');
                });

                // Show selected panel
                panels[index].hidden = false;
                panels[index].setAttribute('aria-hidden', 'false');
            });
        });
    }

    // ...existing code...
});

// ...existing code...

// Add these functions after the existing tag management code
function showTagEditModal(tag) {
    const modal = document.getElementById('tagEditModal');
    const input = document.getElementById('editTagName');

    // Set current tag values
    input.value = tag.name;
    modal.setAttribute('data-tag-id', tag.id);

    // Show modal
    modal.style.display = 'block';

    // Focus input
    input.focus();
}

function hideTagEditModal() {
    const modal = document.getElementById('tagEditModal');
    modal.style.display = 'none';
}

// Modify displayTagsInManager to add double-click handling
function displayTagsInManager(tags) {
    const container = document.getElementById('tagManagerSection');
    console.log('Starting displayTagsInManager:', {
        hasContainer: !!container,
        tags: tags,
        tagsLength: tags ? tags.length : 0
    });

    if (!container) {
        console.error('Tag manager section container not found');
        return;
    }

    // Clear existing tags but don't change display property
    container.innerHTML = '';

    if (!tags || !Array.isArray(tags)) {
        console.error('Invalid tags data:', tags);
        return;
    }

    console.log('Processing tags array:', tags);

    tags.forEach((tag, index) => {
        console.log(`Processing tag ${index}:`, tag);

        try {
            // Create pill container - DEFINE THIS FIRST
            const pill = document.createElement('div');
            pill.classList.add('tag-pill');
            const tagColor = tag.color || '#FF4081';
            pill.style.setProperty('--pill-color', tagColor);
            const contrast = getContentColorForBackground(tagColor);
            pill.style.color = contrast;

            // Create tag icon container with delete button
            const tagIcon = document.createElement('div');
            tagIcon.classList.add('tagIcon');

            // Create delete button and add to tagIcon
            const tagDeleteButton = document.createElement('button');
            tagDeleteButton.type = 'button';
            tagDeleteButton.classList.add('tagDeleteButton');
            tagDeleteButton.title = 'Delete tag from database';
            tagDeleteButton.innerHTML = `<svg focusable="false" preserveAspectRatio="xMidYMid meet" fill="${contrast}" width="16" height="16" viewBox="0 0 32 32" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><path d="M12 12H14V24H12zM18 12H20V24H18z"></path><path d="M4 6V8H6V28a2 2 0 002 2H24a2 2 0 002-2V8h2V6zM8 28V8H24V28zM12 2H20V4H12z"></path></svg>`;

            // Delete button click handler
            tagDeleteButton.addEventListener('click', (e) => {
                e.stopPropagation();
                console.log('Delete button clicked for tag:', tag.name);
                if (confirm(`Delete tag "${tag.name}" from the database? This will remove it from all entries.`)) {
                    fetch(`/api/tags/${tag.id}`, { method: 'DELETE' })
                        .then(response => response.json())
                        .then(result => {
                            console.log('Tag deleted:', result);
                            fetchTags().then(() => updateTagSelection());
                            fetchImages();
                        })
                        .catch(err => console.error('Error deleting tag:', err));
                }
            });

            // Add delete button to tagIcon
            tagIcon.appendChild(tagDeleteButton);

            // Create tag contents container
            const tagContents = document.createElement('span');
            tagContents.classList.add('tagContents');
            tagContents.style.opacity = '0.8';

            // Create tag name
            const tagName = document.createElement('span');
            tagName.classList.add('tagName');
            tagName.textContent = tag.name;

            // Create tagClear container for remove from entries button
            const tagClear = document.createElement('span');
            tagClear.classList.add('tagClear');

            // Add remove from entries button
            const tagRemoveButton = document.createElement('button');
            tagRemoveButton.type = 'button';
            tagRemoveButton.classList.add('tagDeleteButton');
            tagRemoveButton.title = 'Remove tag from selected images';
            tagRemoveButton.innerHTML = `<svg focusable="false" preserveAspectRatio="xMidYMid meet" fill="${contrast}" width="16" height="16" viewBox="0 0 32 32" aria-hidden="true"><path d="M24 9.4L22.6 8 16 14.6 9.4 8 8 9.4l6.6 6.6L8 22.6 9.4 24l6.6-6.6 6.6 6.6 1.4-1.4-6.6-6.6L24 9.4z"></path></svg>`;

            // Add remove handler
            tagRemoveButton.addEventListener('click', (e) => {
                e.stopPropagation();
                const selectedCheckboxes = document.querySelectorAll('.selectImage:checked');
                const ids = Array.from(selectedCheckboxes).map(cb => cb.value);
                if (ids.length > 0) {
                    fetch('/api/entries/tags', {
                            method: 'DELETE',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ ids: ids, tag: tag.name })
                        })
                        .then(() => {
                            fetchImages();
                            deselectAllImages();
                        })
                        .catch(err => console.error('Error removing tag from images:', err));
                }
            });

            // Add remove button to tagClear
            tagClear.appendChild(tagRemoveButton);

            // Assemble the pill structure
            tagContents.appendChild(tagName);
            tagContents.appendChild(tagClear);
            pill.appendChild(tagIcon);
            pill.appendChild(tagContents);

            // Click handler for the pill
            pill.addEventListener('click', (e) => {
                if (e.target.closest('.tagDeleteButton')) return;

                console.log('Tag pill clicked:', tag.name);
                const selectedCheckboxes = document.querySelectorAll('.selectImage:checked');
                const ids = Array.from(selectedCheckboxes).map(cb => cb.value);

                if (ids.length > 0) {
                    console.log('Adding tag to selected images:', ids);
                    fetch('/api/entries/tags', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ ids: ids, tag: tag.name })
                        })
                        .then(() => {
                            fetchImages();
                            deselectAllImages();
                        })
                        .catch(err => console.error('Error adding tag to images:', err));
                } else {
                    console.log('No images selected, showing edit modal');
                    showTagEditModal(tag);
                }
            });

            // Add the completed pill to the container
            container.appendChild(pill);
            console.log(`Successfully added tag pill for: ${tag.name}`);
        } catch (error) {
            console.error(`Error processing tag ${index}:`, error, tag);
        }
    });

    console.log(`Rendered ${tags.length} tags in manager`);
}

// Add modal event listeners when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // ...existing code...

    // Tag Edit Modal Handlers
    const tagEditModal = document.getElementById('tagEditModal');
    const closeTagEditBtn = document.getElementById('closeTagEditBtn');
    const saveTagEditBtn = document.getElementById('saveTagEditBtn');

    if (tagEditModal) {
        // Close modal when clicking outside
        tagEditModal.addEventListener('click', (e) => {
            if (e.target === tagEditModal) {
                hideTagEditModal();
            }
        });
    }

    if (closeTagEditBtn) {
        closeTagEditBtn.addEventListener('click', hideTagEditModal);
    }

    if (saveTagEditBtn) {
        saveTagEditBtn.addEventListener('click', () => {
            const modal = document.getElementById('tagEditModal');
            const tagId = modal.getAttribute('data-tag-id');
            const newName = document.getElementById('editTagName').value.trim();

            if (!newName) return;

            fetch(`/api/tags/${tagId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: newName })
                })
                .then(response => response.json())
                .then(result => {
                    hideTagEditModal();
                    fetchTags(); // Refresh tags display
                    fetchImages(); // Refresh images to update tag names
                })
                .catch(err => console.error('Error updating tag:', err));
        });
    }
});


// Add after the tagManagerToggle handler
if (document.getElementById('playlistManagerToggle')) {
    const playlistManagerToggle = document.getElementById('playlistManagerToggle');
    const playlistManagerSection = document.getElementById('playlistManagerSection');

    // Toggle Playlist Manager Visibility
    playlistManagerToggle.addEventListener('click', function() {
        const tagManagerSection = document.getElementById('tagManagerSection');
        const tagManagerToggle = document.getElementById('tagManagerToggle');
        const newTagForm = document.getElementById('newTagForm');
        const isVisible = window.getComputedStyle(playlistManagerSection).display !== 'none';

        // Close tag manager if open
        if (tagManagerSection) {
            tagManagerSection.style.display = 'none';
            newTagForm.style.display = 'none';
            if (tagManagerToggle) {
                tagManagerToggle.classList.remove('active');
            }
        }

        // Toggle playlist manager
        playlistManagerSection.style.display = isVisible ? 'none' : 'flex';
        playlistManagerToggle.classList.toggle('active');
    });
}

// =====================
// Playlist Management
// =====================

// Store playlists in memory
let playlists = [];

// Fetch playlists from the server on load
function loadPlaylists() {
    // Only load playlists on manage page
    if (!document.getElementById('settingsSection')) {
        return;
    }

    fetch('/api/playlists')
        .then(response => response.json())
        .then(data => {
            playlists = data;
            displayPlaylists();
        })
        .catch(err => console.error('Error fetching playlists:', err));
}

// Save playlists to the server
function savePlaylists() {
    fetch('/api/playlists', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ playlists })
        })
        .then(response => response.json())
        .then(result => {
            console.log(result.message);
        })
        .catch(err => console.error('Error saving playlists:', err));
}

// Create new playlist
function createPlaylist(name) {
    const playlist = {
        id: Date.now(),
        name: name,
        color: backgroundColors[nextPlaylistColorIndex], // Assign color
        hidden: false,
        createdAt: new Date().toISOString(),
        imageIds: []
    };

    // Update the next color index
    nextPlaylistColorIndex = (nextPlaylistColorIndex + 1) % backgroundColors.length;
    localStorage.setItem('nextPlaylistColorIndex', nextPlaylistColorIndex);

    // Optionally add any selected images to the new playlist
    const selectedIds = Array.from(selectedImageIds);
    if (selectedIds.length > 0) {
        playlist.imageIds = selectedIds;
        deselectAllImages();
    }

    playlists.push(playlist);
    savePlaylists();
    displayPlaylists();
}

// Delete a playlist
function deletePlaylist(id) {
    playlists = playlists.filter((p) => p.id !== id);
    savePlaylists();
    displayPlaylists();
}

// Add images to a playlist
function addToPlaylist(playlistId, imageIds) {
    const playlist = playlists.find((p) => p.id === playlistId);
    if (playlist) {
        const uniqueIds = new Set([...playlist.imageIds, ...imageIds]);
        playlist.imageIds = Array.from(uniqueIds);
        savePlaylists();
        displayPlaylists();

        // Update thumbnails if the playlist is expanded
        const playlistItem = document.querySelector(`.playlist-item[data-id="${playlistId}"]`);
        if (playlistItem && playlistItem.querySelector('.playlist-thumbnails').style.display === 'block') {
            updatePlaylistThumbnails(playlistItem.querySelector('.playlist-thumbnails'), playlist.imageIds);
        }
    }
}

// Remove images from a playlist
function removeFromPlaylist(playlistId, imageIds) {
    const playlist = playlists.find((p) => p.id === playlistId);
    if (playlist) {
        playlist.imageIds = playlist.imageIds.filter((id) => !imageIds.includes(id));
        savePlaylists();
        displayPlaylists();

        // Update thumbnails if the playlist is expanded
        const playlistItem = document.querySelector(`.playlist-item[data-id="${playlistId}"]`);
        if (playlistItem) {
            const thumbnailsContainer = playlistItem.querySelector('.playlist-thumbnails');
            if (thumbnailsContainer && thumbnailsContainer.style.display === 'grid') {
                updatePlaylistThumbnails(thumbnailsContainer, playlist.imageIds); // Refresh thumbnails
            }
        }
    }
}

// Toggle playlist visibility
function togglePlaylistVisibility(id) {
    const playlist = playlists.find((p) => p.id === id);
    if (playlist) {
        playlist.hidden = !playlist.hidden;
        savePlaylists();
        displayPlaylists();
    }
}

// Edit playlist name
function editPlaylistName(id, newName) {
    const playlist = playlists.find((p) => p.id === id);
    if (playlist) {
        playlist.name = newName;
        savePlaylists();
        displayPlaylists();
    }
}

// Deselect all selected images (used by playlist actions)
function deselectAllImages() {
    selectedImageIds.clear();
    document.querySelectorAll('.selectImage').forEach((cb) => {
        cb.checked = false;
        const row = cb.closest('tr');
        if (row) row.classList.remove('selected');
    });
    updateHeaderSelect();
}

// Display playlists in the UI
function displayPlaylists() {
    const container = document.getElementById('playlistList');
    if (!container) {
        console.warn('Playlist container not found');
        return;
    }
    container.innerHTML = '';

    if (!Array.isArray(playlists) || playlists.length === 0) { // Ensure playlists is an array
        // Display empty state message if no playlists exist
        const emptyState = document.createElement('div');
        emptyState.className = 'empty-state';
        emptyState.innerHTML = `
            <p>No playlists available. Create a new playlist to get started.</p>
            <button id="createPlaylistBtn">Create Playlist</button>
        `;
        container.appendChild(emptyState);

        // Add event listener to the create playlist button
        const createPlaylistBtn = document.getElementById('createPlaylistBtn');
        if (createPlaylistBtn) {
            createPlaylistBtn.addEventListener('click', () => {
                const name = prompt('Enter playlist name:');
                if (name && name.trim()) {
                    createPlaylist(name.trim());
                }
            });
        }
        return;
    }

    playlists.forEach((playlist) => {
        const playlistItem = document.createElement('div');
        playlistItem.className = `playlist-item${playlist.hidden ? ' hidden' : ''}`;
        playlistItem.dataset.id = playlist.id;

        // Preserve the current display style of the thumbnails container
        const existingPlaylistItem = document.querySelector(`.playlist-item[data-id="${playlist.id}"]`);
        const currentDisplayStyle = existingPlaylistItem ?
            existingPlaylistItem.querySelector('.playlist-thumbnails').style.display :
            'none';

        // Create playlist header with controls
        const header = document.createElement('div');
        header.className = 'playlist-header';
        header.innerHTML = `
            <label class="custom-checkbox">
                <input type="checkbox" class="selectPlaylist">
                <span class="checkmark"></span>
            </label>
            <span class="playlist-color" style="background-color: ${playlist.color}"></span> <!-- Apply color -->
            <h4 class="playlist-name">${playlist.name}</h4>
            <span class="playlist-count">(${playlist.imageIds.length} images)</span>
            <div class="playlist-actions">
                <button class="editPlaylistBtn" title="Edit playlist name">
                    <svg focusable="false" preserveAspectRatio="xMidYMid meet" fill="currentColor" width="16" height="16" viewBox="0 0 32 32">
                        <path d="M2 26H30V28H2zM25.4 9c.8-.8.8-2 0-2.8 0 0 0 0 0 0l-3.6-3.6c-.8-.8-2-.8-2.8 0 0 0 0 0 0 0l-15 15V24h6.4L25.4 9zM20.4 4L24 7.6l-3 3L17.4 7 20.4 4zM6 22v-3.6l10-10 3.6 3.6-10 10H6z"></path>
                    </svg>
                </button>
                <button class="visibilityBtn" title="${playlist.hidden ? 'Show playlist' : 'Hide playlist'}">
                    <svg focusable="false" preserveAspectRatio="xMidYMid meet" fill="currentColor" width="16" height="16" viewBox="0 0 32 32">
                        <path d="M30.94,15.66A16.69,16.69,0,0,0,16,5,16.69,16.69,0,0,0,1.06,15.66a1,1,0,0,0,0,.68A16.69,16.69,0,0,0,16,27,16.69,16.69,0,0,0,30.94,16.34,1,1,0,0,0,30.94,15.66ZM16,25c-5.3,0-10.9-3.93-12.93-9C5.1,10.93,10.7,7,16,7s10.9,3.93,12.93,9C26.9,21.07,21.3,25,16,25Z"></path>
                    </svg>
                </button>
                <button class="deletePlaylistBtn" title="Delete playlist">
                    <svg focusable="false" preserveAspectRatio="xMidYMid meet" fill="currentColor" width="16" height="16" viewBox="0 0 32 32">
                        <path d="M12 12H14V24H12zM18 12H20V24H18z"></path>
                        <path d="M4 6V8H6V28a2 2 0 002 2H24a2 2 0 002-2V8h2V6zM8 28V8H24V28zM12 2H20V4H12z"></path>
                    </svg>
                </button>
                <button class="playPlaylistBtn" title="Play playlist">
                    <svg focusable="false" preserveAspectRatio="xMidYMid meet" fill="currentColor" width="16" height="16" viewBox="0 0 32 32">
                        <path d="M7 28a1 1 0 01-1-1V5a1 1 0 011.4819-.8763l20 11a1 1 0 010 1.7525l-20 11A1.0005,1.0005,0,0,1,7,28z"></path>
                    </svg>
                </button>
            </div>
        `;

        // Add event listener for expanding/collapsing thumbnails
        const playlistCount = header.querySelector('.playlist-count');
        playlistCount.addEventListener('click', () => togglePlaylistThumbnails(playlistItem, playlist));

        // Attach event listeners for header actions
        const editBtn = header.querySelector('.editPlaylistBtn');
        if (editBtn) {
            editBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                showPlaylistEditModal(playlist);
            });
        }
        const visibilityBtn = header.querySelector('.visibilityBtn');
        if (visibilityBtn) {
            visibilityBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                togglePlaylistVisibility(playlist.id);
            });
        }
        const deleteBtn = header.querySelector('.deletePlaylistBtn');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (confirm('Are you sure you want to delete this playlist?')) {
                    deletePlaylist(playlist.id);
                }
            });
        }
        const playBtn = header.querySelector('.playPlaylistBtn');
        if (playBtn) {
            playBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                // Implement play playlist functionality
            });
        }

        // Add event listener to add selected images to the playlist
        playlistItem.addEventListener('click', () => {
            const selectedIds = Array.from(selectedImageIds);
            if (selectedIds.length > 0) {
                addToPlaylist(playlist.id, selectedIds);
                deselectAllImages();
            }
        });

        // Append header to playlist item
        playlistItem.appendChild(header);

        // Create a container for thumbnails (hidden by default)
        const thumbnailsContainer = document.createElement('div');
        thumbnailsContainer.className = 'playlist-thumbnails';
        thumbnailsContainer.style.display = currentDisplayStyle; // Initially hidden
        playlistItem.appendChild(thumbnailsContainer);

        container.appendChild(playlistItem);
    });
}

function togglePlaylistThumbnails(playlistItem, playlist) {
    const thumbnailsContainer = playlistItem.querySelector('.playlist-thumbnails');
    const isExpanded = thumbnailsContainer.style.display === 'grid';

    if (isExpanded) {
        thumbnailsContainer.style.display = 'none';
        playlistItem.querySelector('.playlist-count').classList.remove('expanded');
        playlist.expanded = false; // Update playlist state
    } else {
        thumbnailsContainer.style.display = 'grid';
        playlistItem.querySelector('.playlist-count').classList.add('expanded');
        thumbnailsContainer.dataset.playlistId = playlist.id; // Store playlist ID for reference
        updatePlaylistThumbnails(thumbnailsContainer, playlist.imageIds);
        playlist.expanded = true; // Update playlist state
    }
}

function updatePlaylistThumbnails(container, imageIds) {
    container.innerHTML = ''; // Clear existing thumbnails
    imageIds.forEach((imageId) => {
        const image = window.images.find((img) => img.id === imageId); // Ensure images are fetched globally
        if (image) {
            const thumbnailWrapper = document.createElement('div');
            thumbnailWrapper.className = 'thumbnail-wrapper';

            const thumbnail = document.createElement('img');
            thumbnail.src = image.thumbnailUrl || image.url; // Use thumbnail URL if available
            thumbnail.alt = image.title || 'Image';
            thumbnail.className = 'playlist-thumbnail';

            // Create delete button
            const deleteButton = document.createElement('button');
            deleteButton.className = 'delete-thumbnail-btn';
            deleteButton.innerHTML = '<svg focusable="false" preserveAspectRatio="xMidYMid meet" fill="#ffffff" width="16" height="16" viewBox="0 0 32 32" aria-hidden="true"><path d="M24 9.4L22.6 8 16 14.6 9.4 8 8 9.4l6.6 6.6L8 22.6 9.4 24l6.6-6.6 6.6 6.6 1.4-1.4-6.6-6.6L24 9.4z"></path></svg>'; // Simple "X" icon
            deleteButton.title = 'Remove from playlist';
            deleteButton.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent triggering other events
                const playlistId = container.dataset.playlistId; // Get playlist ID from container
                if (playlistId) {
                    removeFromPlaylist(parseInt(playlistId, 10), [imageId]); // Remove image from playlist
                }
            });

            thumbnailWrapper.appendChild(thumbnail);
            thumbnailWrapper.appendChild(deleteButton);
            container.appendChild(thumbnailWrapper);
        } else {
            console.warn(`Image with ID ${imageId} not found in global images.`);
        }
    });
}

// Ensure the container has the playlist ID for removing images
function togglePlaylistThumbnails(playlistItem, playlist) {
    const thumbnailsContainer = playlistItem.querySelector('.playlist-thumbnails');
    const isExpanded = thumbnailsContainer.style.display === 'grid';

    if (isExpanded) {
        thumbnailsContainer.style.display = 'none';
        playlistItem.querySelector('.playlist-count').classList.remove('expanded');
    } else {
        thumbnailsContainer.style.display = 'grid';
        playlistItem.querySelector('.playlist-count').classList.add('expanded');
        thumbnailsContainer.dataset.playlistId = playlist.id; // Store playlist ID for reference
        updatePlaylistThumbnails(thumbnailsContainer, playlist.imageIds);
    }
}

// Ensure images are fetched globally when the page loads
document.addEventListener('DOMContentLoaded', () => {
    fetch('/api/images')
        .then(response => response.json())
        .then(data => {
            window.images = data; // Store images globally for easy access
            console.log('Images loaded globally:', window.images);
        })
        .catch(err => console.error('Error fetching images:', err));
});

// Playlist edit modal functions
function showPlaylistEditModal(playlist) {
    const modal = document.getElementById('playlistEditModal');
    const input = document.getElementById('editPlaylistName');
    if (!modal || !input) return;
    input.value = playlist.name || '';
    modal.setAttribute('data-playlist-id', playlist.id || '');
    modal.style.display = 'block';
    input.focus();
}

function hidePlaylistEditModal() {
    const modal = document.getElementById('playlistEditModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// Event listeners for playlist management
document.addEventListener('DOMContentLoaded', () => {
    // New playlist button via prompt
    const newPlaylistBtn = document.getElementById('newPlaylistBtn');
    if (newPlaylistBtn) {
        newPlaylistBtn.addEventListener('click', () => {
            const name = prompt('Enter playlist name:');
            if (name && name.trim()) {
                createPlaylist(name.trim());
            }
        });
    }

    // New playlist form (if available)
    const newPlaylistForm = document.getElementById('newPlaylistForm');
    if (newPlaylistForm) {
        newPlaylistForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const input = document.getElementById('newPlaylistName');
            const name = input.value.trim();
            if (name) {
                createPlaylist(name);
                input.value = '';
            }
        });
    }

    // Playlist edit modal buttons
    const closePlaylistEditBtn = document.getElementById('closePlaylistEditBtn');
    const savePlaylistEditBtn = document.getElementById('savePlaylistEditBtn');
    if (closePlaylistEditBtn) {
        closePlaylistEditBtn.addEventListener('click', hidePlaylistEditModal);
    }
    if (savePlaylistEditBtn) {
        savePlaylistEditBtn.addEventListener('click', () => {
            const modal = document.getElementById('playlistEditModal');
            const playlistId = modal.getAttribute('data-playlist-id');
            const newName = document.getElementById('editPlaylistName').value.trim();
            if (newName) {
                if (playlistId) {
                    editPlaylistName(Number(playlistId), newName);
                } else {
                    createPlaylist(newName);
                }
                hidePlaylistEditModal();
            }
        });
    }

    loadPlaylists();
});

document.addEventListener('DOMContentLoaded', () => {
    const playlistSearch = document.getElementById('playlistSearch');
    if (playlistSearch) {
        playlistSearch.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase();
            const playlistItems = document.querySelectorAll('.playlist-item');
            playlistItems.forEach(item => {
                const name = item.querySelector('.playlist-name').textContent.toLowerCase();
                item.style.display = name.includes(query) ? '' : 'none';
            });
        });
    }
});

const playTagsBtn = document.getElementById('playTagsBtn');
if (playTagsBtn) {
    playTagsBtn.addEventListener('click', () => {
        const selectedPills = document.querySelectorAll('#tagSelectionContainer .tag-pill.selected');
        const selectedTagNames = Array.from(selectedPills).map(p => p.textContent.trim().toLowerCase());
        const transitionTime = parseFloat(localStorage.getItem('transitionTime')) || 3;
        const order = localStorage.getItem('slideshowOrder') || 'random';

        // Filter images based on selected tags
        let playImages = selectedTagNames.length === 0 ?
            window.imagesData :
            window.imagesData.filter(img =>
                img.tags.some(t => selectedTagNames.includes(t.name.trim().toLowerCase()))
            );

        // Sort images if needed
        if (order === 'alphabetical') {
            playImages.sort((a, b) => a.title.localeCompare(b.title));
        } else if (order === 'random') {
            playImages = [...playImages].sort(() => Math.random() - 0.5);
        }

        // Send only necessary data
        const lightImages = playImages.map(img => ({
            id: img.id,
            url: img.url,
            title: img.title,
            description: img.description || ''
        }));

        fetch('/api/updateSlideshow', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'playSelect',
                images: lightImages,
                speed: transitionTime,
                order: order
            })
        }).catch(err => console.error('Error in playSelect:', err));
    });
}

// ...existing code...

window.nextImage = function() {
    // Get current image list
    const imageList = window.selectedSlideshowImages || window.images || [];
    const order = window.slideshowOrder || localStorage.getItem('slideshowOrder') || 'random';

    console.log('nextImage called:', {
        order: order,
        currentIndex: window.currentIndex,
        listLength: imageList.length,
        usedImagesCount: window.usedRandomImages ? window.usedRandomImages.size : 0
    });

    if (imageList.length === 0) {
        console.warn('No images available for navigation');
        return;
    }

    // Handle different ordering modes
    switch (order) {
        case 'random':
            // Reset tracking if all images have been shown
            if (!window.usedRandomImages) {
                window.usedRandomImages = new Set();
            }
            
            if (window.usedRandomImages.size >= imageList.length) {
                window.usedRandomImages.clear();
            }

            // Find next unused random image
            let nextIndex;
            do {
                nextIndex = Math.floor(Math.random() * imageList.length);
            } while (window.usedRandomImages.has(imageList[nextIndex].id));

            window.currentIndex = nextIndex;
            window.usedRandomImages.add(imageList[nextIndex].id);
            break;

        case 'groups':
            // Get grouped images
            const groupedList = groupOrderImages(imageList);
            if (groupedList.length > 0) {
                window.currentIndex = (window.currentIndex + 1) % groupedList.length;
                window.selectedSlideshowImages = groupedList;
            } else {
                window.currentIndex = (window.currentIndex + 1) % imageList.length;
            }
            break;

        case 'alphabetical':
        default:
            // Sort alphabetically if not already sorted
            const sortedList = [...imageList].sort((a, b) => a.title.localeCompare(b.title));
            window.selectedSlideshowImages = sortedList;
            window.currentIndex = (window.currentIndex + 1) % sortedList.length;
            break;
    }

    // Emit navigation event to other clients
    socket.emit('navigation', {
        action: 'next',
        index: window.currentIndex
    });

    // Perform the transition
    crossfadeTo(window.currentIndex, window.selectedSlideshowImages);
    resetSlideshowInterval();
};

// ...existing code...