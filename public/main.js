// ======================
// SLIDESHOW FUNCTIONALITY (Index Page)
// ======================
if (document.getElementById('slide1')) {
    // Variables to store images and current index
    let images = [];
    let currentIndex = 0;
    let transitionTime = parseFloat(localStorage.getItem('transitionTime')) || 3;
    const order = localStorage.getItem('slideshowOrder') || 'random';
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

    // ======================
    // Fetch Images and Initialize Slideshow
    // ======================
    fetch('/api/images')
        .then(response => response.json())
        .then(data => {
            console.log('Received images data:', data[0]); // Log first image
            images = data;
            window.slideshowImages = images; // global fallback list
            if (images.length > 0) {
                if (order === 'alphabetical') {
                    images.sort((a, b) => a.title.localeCompare(b.title));
                } else if (order === 'random') {
                    shuffleArray(images);
                    currentIndex = Math.floor(Math.random() * images.length);
                }
                currentSlideElement.src = images[currentIndex].url;
                if (currentTitleOverlay) {
                    currentTitleOverlay.innerText = images[currentIndex].title;
                    currentTitleOverlay.classList.add('active');
                }
                if (currentSubtitleOverlay) {
                    console.log('Setting initial description:', {
                        imageId: images[currentIndex].id,
                        description: images[currentIndex].description,
                        hasDescriptionProperty: 'description' in images[currentIndex]
                    });
                    currentSubtitleOverlay.innerText = images[currentIndex].description || '';
                    currentSubtitleOverlay.classList.add('active');
                } else {
                    console.warn('Subtitle overlay element not found');
                }
                startSlideshow();
            }
        })
        .catch(err => console.error('Error fetching images:', err));

    // ======================
    // Crossfade to Next Image
    // ======================
    function crossfadeTo(index, list) {
        console.log('crossfadeTo called with:', {
            index,
            listLength: list ? list.length : 'no list provided',
            currentSlideElement: currentSlideElement.src,
            nextSlideElement: nextSlideElement.src,
            windowImages: window.images ? window.images.length : 'not set',
            selectedImages: window.selectedSlideshowImages ? window.selectedSlideshowImages.length : 'not set'
        });

        const imageList = list || images;
        console.log('Using image list:', {
            length: imageList.length,
            currentImage: imageList[index],
            hasDescription: imageList[index] ? 'description' in imageList[index] : false
        });

        nextSlideElement.src = imageList[index].url;
        if (nextTitleOverlay) {
            nextTitleOverlay.innerText = imageList[index].title;
        }
        if (nextSubtitleOverlay) {
            nextSubtitleOverlay.innerText = imageList[index].description || '';
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
        const imageList = (window.selectedSlideshowImages && window.selectedSlideshowImages.length > 0) ?
            window.selectedSlideshowImages :
            images;
        let newList = imageList;
        if (order === 'alphabetical') {
            newList.sort((a, b) => a.title.localeCompare(b.title));
            currentIndex = (currentIndex + 1) % newList.length;
        } else if (order === 'random') {
            if (currentIndex < newList.length - 1) {
                currentIndex++;
            } else {
                shuffleArray(newList);
                currentIndex = 0;
            }
        } else if (order === 'groups') {
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
            images;
        currentIndex = (currentIndex - 1 + imageList.length) % imageList.length;
        crossfadeTo(currentIndex, imageList);
        resetSlideshowInterval();
    }

    // ======================
    // Slideshow Interval Management
    // ======================
    // Start the slideshow
    function startSlideshow() {
        window.slideshowInterval = setInterval(nextImage, transitionTime * 1000);
    }

    // Reset the slideshow interval
    function resetSlideshowInterval() {
        if (!window.slideshowPaused) { // Only restart if not paused
            clearInterval(window.slideshowInterval);
            window.slideshowInterval = setInterval(nextImage, transitionTime * 1000);
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
            transitionTime = parseFloat(localStorage.getItem('transitionTime')) || 3;
            clearInterval(window.slideshowInterval);
            window.slideshowInterval = setInterval(nextImage, transitionTime * 1000);
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
}

// NEW: Global pagination variables for management page
let currentPage = 1;
let currentLimit = 20; // entries per page
let totalPages = 1;
// ======================
// MANAGE PAGE FUNCTIONALITY (Settings, Upload, Pictures, and Tag Management)
// ======================
if (document.getElementById('settingsForm')) {
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
    let selectedImageIds = new Set();

    // Ensure global imagesData is available for management page
    window.imagesData = [];

    // ----- PICTURES MANAGEMENT FUNCTIONALITY -----
    let imagesData = [];
    let currentSortKey = null;
    let currentSortDirection = 'asc';

    // UPDATED sortImages: remove pagination dependencies; sort over entire array
    function sortImages(images) {
        if (!currentSortKey) return images;
        return images.sort((a, b) => {
            const valA = currentSortKey === 'tags' ? a.tags.join(', ') : a[currentSortKey] || '';
            const valB = currentSortKey === 'tags' ? b.tags.join(', ') : b[currentSortKey] || '';
            if (currentSortKey === 'dateAdded') {
                return currentSortDirection === 'asc' ?
                    Number(valA) - Number(valB) :
                    Number(valB) - Number(valA);
            } else {
                const cmp = String(valA).localeCompare(String(valB));
                return currentSortDirection === 'asc' ? cmp : -cmp;
            }
        });
    }

    // Function to update sort indicators
    function updateSortIndicators() {
        document.querySelectorAll('#imageTable th.sortable').forEach(header => {
            let baseText = header.getAttribute('data-label');
            if (!baseText) {
                baseText = header.textContent.replace(/[▲▼]/g, '').trim();
                header.setAttribute('data-label', baseText);
            }
            if (header.getAttribute('data-key') === currentSortKey) {
                const arrow = currentSortDirection === 'asc' ? ' ▲' : ' ▼';
                header.innerHTML = baseText + `<span class="sort-arrow">${arrow}</span>`;
            } else {
                header.innerHTML = baseText;
            }
        });
    }

    // Event listener for sortable headers
    document.querySelectorAll('#imageTable th.sortable').forEach(header => {
        header.addEventListener('click', () => {
            const key = header.getAttribute('data-key');
            if (currentSortKey === key) {
                currentSortDirection = currentSortDirection === 'asc' ? 'desc' : 'asc';
            } else {
                currentSortKey = key;
                currentSortDirection = 'asc';
            }
            updateSortIndicators();
            fetchImages();
        });
    });

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
                }
                window.imagesData = data;
                let sortedImages = sortImages(data);
                // NEW: Filter images using the search query (by title)
                const queryEl = document.getElementById('search');
                const query = queryEl ? queryEl.value.trim().toLowerCase() : '';
                if (query) {
                    sortedImages = sortedImages.filter(image =>
                        image.title.toLowerCase().includes(query)
                    );
                }
                // Global pagination update
                totalPages = Math.ceil(sortedImages.length / currentLimit) || 1;
                if (currentPage > totalPages) currentPage = totalPages;
                const pageEntries = sortedImages.slice((currentPage - 1) * currentLimit, currentPage * currentLimit);
                displayImages(pageEntries);
                updatePagination(sortedImages.length);
            })
            .catch(err => console.error("Error fetching images:", err));
    }

    // Function to display images in the table
    function displayImages(images) {
        const imageTableBody = document.querySelector('#imageTable tbody');
        imageTableBody.innerHTML = '';

        images.forEach(image => {
            const tr = document.createElement('tr');

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
            if (selectedImageIds.has(image.id)) {
                checkbox.checked = true;
                tr.classList.add('selected');
            }
            checkbox.addEventListener('change', function() {
                if (checkbox.checked) {
                    selectedImageIds.add(image.id);
                } else {
                    selectedImageIds.delete(image.id);
                }
                tr.classList.toggle('selected', checkbox.checked);
                updateHeaderSelect();
            });
            const checkmarkSpan = document.createElement('span');
            checkmarkSpan.classList.add('checkmark');
            checkboxLabel.appendChild(checkbox);
            checkboxLabel.appendChild(checkmarkSpan);
            selectCell.appendChild(checkboxLabel);
            tr.appendChild(selectCell);

            // Thumbnail cell
            const thumbCell = document.createElement('td');
            thumbCell.classList.add('col-thumb');
            const thumb = document.createElement('img');
            thumb.src = image.url;
            thumb.alt = image.title;
            thumb.className = 'thumbnail';
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
                    tagIcon.style.width = '1em';

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
            const dateObj = new Date(Number(image.dateAdded));
            const day = dateObj.getDate();
            const month = dateObj.getMonth() + 1;
            const year = dateObj.getFullYear().toString().slice(-2);
            dateCell.textContent = `${day}/${month}/${year}`;
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
                window.slideshowPaused = false; // Set to false to allow new transitions

                // Reset slideshow state with the single image
                window.selectedSlideshowImages = [image];
                window.currentIndex = 0;

                // Update DOM elements directly first for immediate feedback
                const slide1 = document.getElementById('slide1');
                const titleOverlay1 = document.getElementById('title-overlay1');
                const subtitleOverlay1 = document.getElementById('subtitle-overlay1');

                if (slide1) slide1.src = image.url;
                if (titleOverlay1) titleOverlay1.innerText = image.title;
                if (subtitleOverlay1) subtitleOverlay1.innerText = image.description || '';

                // Then notify other clients
                fetch('/api/updateSlideshow', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            action: 'playSelect',
                            images: [image]
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
    // Based on imagesData filtered by current search and current selection
    const availableTags = new Set();
    const filtered = window.imagesData.filter(image => {
        const imageTags = image.tags.map(t => t.name.toLowerCase());
        return selectedFilterTags.every(tag => imageTags.includes(tag));
    });
    filtered.forEach(image => {
        image.tags.forEach(t => availableTags.add(t.name.toLowerCase()));
    });
    // Update each pill in the dropdown
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
    // First, apply search filtering if any:
    const queryEl = document.getElementById('search');
    const query = queryEl ? queryEl.value.trim().toLowerCase() : '';
    if (query) {
        images = images.filter(image => image.title.toLowerCase().includes(query));
    }
    // Then filter by selected tags: only include images that contain all selected filter tags.
    if (selectedFilterTags.length > 0) {
        images = images.filter(image => {
            const imageTags = image.tags.map(t => t.name.toLowerCase());
            return selectedFilterTags.every(tag => imageTags.includes(tag));
        });
    }
    // NEW: Update pagination controls based on the filtered images
    totalPages = Math.ceil(images.length / currentLimit) || 1;
    if (currentPage > totalPages) currentPage = totalPages;
    const pageEntries = images.slice((currentPage - 1) * currentLimit, currentPage * currentLimit);
    displayImages(pageEntries);
    updatePagination(images.length);
}

// NEW: Toggle dropdown visibility on filter button click
document.addEventListener('DOMContentLoaded', () => {
    // Move these inside the settings form check
    if (document.getElementById('settingsForm')) {
        const filterBtn = document.getElementById('filterBtn');
        const dropdown = document.getElementById('tagFilterDropdown');
        if (filterBtn && dropdown) {
            filterBtn.addEventListener('click', () => {
                dropdown.style.display = (dropdown.style.display === "none" || dropdown.style.display === "") ? "flex" : "none";
                if (dropdown.style.display === "flex") {
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

    // Append controls in order (without the "Show per page" span)
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

// Function to update header select checkbox
function updateHeaderSelect() {
    const headerSelect = document.getElementById('headerSelect');
    const rowCheckboxes = document.querySelectorAll('#imageTable tbody .selectImage');
    const allChecked = Array.from(rowCheckboxes).every(cb => cb.checked);
    headerSelect.checked = allChecked;
}

// Function to bind header select checkbox
function bindHeaderSelect() {
    const headerSelect = document.getElementById('headerSelect');
    if (headerSelect) {
        headerSelect.addEventListener('change', function() {
            const checked = headerSelect.checked;
            // Use a specific selector for rows in the table body
            const rowCheckboxes = document.querySelectorAll('#imageTable tbody .selectImage');
            rowCheckboxes.forEach(cb => {
                cb.checked = checked;
                const row = cb.closest('tr');
                if (row) {
                    row.classList.toggle('selected', checked);
                }
                if (checked) {
                    selectedImageIds.add(cb.value);
                } else {
                    selectedImageIds.delete(cb.value);
                }
            });
        });
    }
}

// Bulk Delete functionality remains unchanged
document.getElementById('bulkDelete').addEventListener('click', () => {
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

// Call this function on DOMContentLoaded:
document.addEventListener('DOMContentLoaded', bindHeaderSelect);

// Function to update slideshow settings
function updateSlideshowSettings() {
    const speed = parseFloat(document.getElementById('speed').value);
    const order = document.getElementById('order').value;
    localStorage.setItem('transitionTime', speed);
    localStorage.setItem('slideshowOrder', order);
    // Notify the server to update the slideshow settings
    fetch('/api/updateSlideshow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'updateSettings', speed, order })
    }).catch(err => console.error(err));
}

// Settings form submission
document.addEventListener('DOMContentLoaded', () => {
    const settingsForm = document.getElementById('settingsForm');
    if (settingsForm) {
        settingsForm.addEventListener('submit', function(e) {
            e.preventDefault(); // Prevent page refresh
            updateSlideshowSettings();
            const saveMessage = document.getElementById('saveMessage');
            saveMessage.innerText = 'Settings saved!';
            saveMessage.classList.add('visible');
            setTimeout(() => {
                saveMessage.classList.add('fade-out');
                setTimeout(() => saveMessage.remove(), 500);
            }, 5000);
        });
    }
});

// ---------------------
// TAG MANAGEMENT FUNCTIONALITY (Manage Page)
// ---------------------
if (document.getElementById('tagManagerToggle')) {
    const tagManagerToggle = document.getElementById('tagManagerToggle');
    // Set the innerHTML to the provided SVG
    tagManagerToggle.innerHTML = `<svg focusable="false" preserveAspectRatio="xMidYMid meet" fill="currentColor" width="24" height="24" viewBox="0 0 32 32" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><circle cx="14" cy="14" r="2"></circle><path d="M20,30a.9967.9967,0,0,1-.707-.293L8.5859,19A2.0126,2.0126,0,0,1,8,17.5859V10a2.002,2.002,0,0,1,2-2h7.5859A1.9864,1.9864,0,0,1,19,8.5859L29.707,19.293a.9994.9994,0,0,1,0,1.414l-9,9A.9967.9967,0,0,1,20,30ZM10,10v7.5859l10,10L27.5859,20l-10-10Z"></path><path d="M12,30H4a2.0021,2.0021,0,0,1-2-2V4A2.0021,2.0021,0,0,1,4,2H28a2.0021,2.0021,0,0,1,2,2v8H28V4H4V28h8Z"></path></svg>`;

    // Apply the same style as settingsToggle (assumes you have a common class for toggles)
    tagManagerToggle.classList.add('settingsToggle');
    tagManagerToggle.style.backgroundColor = 'transparent';
    tagManagerToggle.style.color = 'inherit';

    // Add hover state (if details is not open)
    tagManagerToggle.addEventListener('mouseover', function() {
        tagManagerToggle.style.backgroundColor = 'var(--accent-color)';
        tagManagerToggle.style.color = '#fff';
    });
    tagManagerToggle.addEventListener('mouseout', function() {
        const details = document.getElementById('settings-details');
        if (!details.open) {
            tagManagerToggle.style.backgroundColor = 'transparent';
            tagManagerToggle.style.color = 'inherit';
        }
    });

    // Toggle Tag Manager Visibility when clicked
    tagManagerToggle.addEventListener('click', function() {
        const managerSection = document.getElementById('tagManagerSection');
        const newTagForm = document.getElementById('newTagForm');
        if (managerSection.style.display === 'flex') {
            managerSection.style.display = 'none';
            newTagForm.style.display = 'none';
        } else {
            managerSection.style.display = 'flex';
            newTagForm.style.display = 'flex';
            fetchTags().then(() => updateTagSelection());
        }
    });
}

/**
 * Fetch all tags (excluding "all")
 */
function fetchTags() {
    return fetch('/api/tags')
        .then(response => response.json())
        .then(tags => {
            tags = tags.filter(tag => tag.name.toLowerCase() !== 'all');
            tags.sort((a, b) => a.name.localeCompare(b.name));
            displayTags(tags);
        })
        .catch(err => console.error(err));
}

/**
 * Display tag pills
 * @param {Array} tags - Array of tag objects
 */
function displayTags(tags) {
    const container = document.getElementById('tagManagerSection');
    container.innerHTML = ''; // Clear previous tags
    tags.forEach(tag => {
        const pill = document.createElement('div');
        pill.classList.add('tag-pill');
        // Set custom property for background color
        const tagColor = tag.color ? tag.color : '#FF4081';
        pill.style.setProperty('--pill-color', tagColor);
        const contrast = getContentColorForBackground(tagColor);
        pill.style.color = contrast;

        // Create tagIcon container and add a delete button inside it
        const tagIcon = document.createElement('div');
        tagIcon.classList.add('tagIcon');
        // Create a button inside tagIcon that deletes the tag from the DB
        const tagDeleteDbButton = document.createElement('button');
        tagDeleteDbButton.type = 'button';
        tagDeleteDbButton.classList.add('tagDeleteDbButton', 'tagDeleteButton');
        // Insert an SVG icon (using currentColor so it takes the contrast color)
        tagDeleteDbButton.innerHTML = `<svg focusable="false" preserveAspectRatio="xMidYMid meet" fill="${contrast}" width="16" height="16" viewBox="0 0 32 32" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><path d="M12 12H14V24H12zM18 12H20V24H18z"></path><path d="M4 6V8H6V28a2 2 0 002 2H24a2 2 0 002-2V8h2V6zM8 28V8H24V28zM12 2H20V4H12z"></path></svg>`;
        tagDeleteDbButton.addEventListener('click', function(e) {
            e.stopPropagation();
            if (confirm(`Delete tag "${tag.name}" from the database? This will remove it from all entries.`)) {
                fetch(`/api/tags/${tag.id}`, { method: 'DELETE' })
                    .then(response => response.json())
                    .then(result => {
                        alert(result.message); // Alert on deletion
                        fetchTags().then(() => updateTagSelection());
                        fetchImages();
                    })
                    .catch(err => console.error(err));
            }
        });
        tagIcon.appendChild(tagDeleteDbButton);

        // Create tagContents container (for tag name and clear button)
        const tagContents = document.createElement('span');
        tagContents.classList.add('tagContents');
        tagContents.style.opacity = '0.8';

        const tagName = document.createElement('span');
        tagName.classList.add('tagName');
        tagName.textContent = tag.name;

        const tagClear = document.createElement('span');
        tagClear.classList.add('tagClear');

        // Create delete button for removing tag from selected entries (no alert)
        const tagDeleteButton = document.createElement('button');
        tagDeleteButton.type = 'button';
        tagDeleteButton.classList.add('tagDeleteButton');
        tagDeleteButton.addEventListener('click', function(e) {
            e.stopPropagation();
            // Remove tag from all selected entries (no alert)
            const selectedCheckboxes = document.querySelectorAll('.selectImage:checked');
            const ids = Array.from(selectedCheckboxes).map(cb => cb.value);
            if (ids.length > 0) {
                fetch('/api/entries/tags', {
                        method: 'DELETE',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ ids: ids, tag: tag.name })
                    })
                    .then(() => fetchImages())
                    .catch(err => console.error(err));
            }
        });
        tagClear.appendChild(tagDeleteButton);

        tagContents.appendChild(tagName);
        tagContents.appendChild(tagClear);

        pill.appendChild(tagIcon);
        pill.appendChild(tagContents);

        // When clicking the pill (except the delete buttons), apply tag to selected entries (no alert)
        pill.addEventListener('click', function(e) {
            if (e.target.closest('.tagDeleteButton') || e.target.closest('.tagDeleteDbButton')) return;
            const selectedCheckboxes = document.querySelectorAll('.selectImage:checked');
            const ids = Array.from(selectedCheckboxes).map(cb => cb.value);
            if (ids.length > 0) {
                fetch('/api/entries/tags', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ ids: ids, tag: tag.name })
                    })
                    .then(() => {
                        fetchImages();
                        // NEW: Clear selection after applying tag from a pill click
                        selectedImageIds = new Set();
                        updateHeaderSelect();
                    })
                    .catch(err => console.error(err));
            }
        });

        container.appendChild(pill);
    });
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

// NEW: Add a global initialization to persist the next tag color index
nextTagColorIndex = localStorage.getItem('nextTagColorIndex');
if (nextTagColorIndex === null) {
    nextTagColorIndex = 0;
    localStorage.setItem('nextTagColorIndex', '0');
} else {
    nextTagColorIndex = parseInt(nextTagColorIndex, 10);
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
                            // NEW: Clear selection after applying tag
                            selectedImageIds = new Set();
                            updateHeaderSelect();
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
            const order = localStorage.getItem('slideshowOrder') || 'alphabetical';
            if (order === 'alphabetical') {
                playImages.sort((a, b) => a.title.localeCompare(b.title));
            } else if (order === 'random') {
                playImages.sort(() => Math.random() - 0.5);
            }
        }
        fetch('/api/updateSlideshow', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'playSelect',
                images: playImages
            })
        }).catch(err => console.error(err));
    });
}

// UPDATED: Update tag selector for play functionality using same structure as tag manager including .tagClear span
function updateTagSelection() {
    fetch('/api/tags')
        .then(response => response.json())
        .then(tags => {
            // Filter out "all" and sort alphabetically
            tags = tags.filter(t => t.name.trim().toLowerCase() !== 'all').sort((a, b) => a.name.localeCompare(b.name));
            const container = document.getElementById('tagSelectionContainer');
            if (!container) return;
            container.innerHTML = ''; // Clear existing
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
        })
        .catch(err => console.error(err));
}

// MODIFY: In the Play tags button event listener, use selected tags for filtering.
// If none are selected play all images normally.
document.addEventListener('DOMContentLoaded', () => {
    const playTagsBtn = document.getElementById('playTagsBtn');
    if (playTagsBtn) {
        playTagsBtn.addEventListener('click', () => {
            const selectedPills = document.querySelectorAll('#tagSelectionContainer .tag-pill.selected');
            const selectedTagNames = Array.from(selectedPills).map(p => p.textContent.trim().toLowerCase());
            let playImages = [];
            if (selectedTagNames.length === 0) {
                // No tags selected; play all images as normal.
                playImages = window.imagesData;
            } else {
                // Filter images which include at least one selected tag.
                playImages = window.imagesData.filter(img =>
                    img.tags.some(t => selectedTagNames.includes(t.name.trim().toLowerCase()))
                );
            }
            // Optionally sort based on order setting.
            const order = localStorage.getItem('slideshowOrder') || 'random';
            if (order === 'alphabetical') {
                playImages.sort((a, b) => a.title.localeCompare(b.title));
            } else if (order === 'random') {
                playImages.sort(() => Math.random() - 0.5);
            }
            // Broadcast the selected images to update the slideshow.
            fetch('/api/updateSlideshow', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'playSelect', images: playImages })
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
    // Attach event listeners to navigation arrows to fix the bug
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
                    <path d="M7,28a1,1,0,0,1-1-1V5a1,1,0,0,1,1.4819-.8763l20,11a1,1,0,0,1,0,1.7525l-20,11A1.0005,1.0005,0,0,1,7,28Z"></path>
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
    document.getElementById('closeEditBtn').addEventListener('click', hideEditModal);
    document.getElementById('saveEditBtn').addEventListener('click', () => {
        const modal = document.getElementById('editModal');
        const id = modal.getAttribute('data-image-id');
        const newTitle = document.getElementById('editTitle').value.trim();
        const newDescription = document.getElementById('editDescription').value.trim();
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
});