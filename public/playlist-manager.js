// This file contains the isolated playlist functionality
// Include this in manage.html after main.js to ensure it has access to all global functions and data

// Wait for the DOM to be fully loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('Playlist manager script loaded');

    // Find the playlist management components
    const playlistManagerToggle = document.getElementById('playlistManagerToggle');
    const playlistManagerSection = document.getElementById('playlistManagerSection');

    // Immediately log which elements we found to help debugging
    console.log('Found playlist elements:', {
        toggle: !!playlistManagerToggle,
        section: !!playlistManagerSection,
        toggleId: playlistManagerToggle ? playlistManagerToggle.id : 'not found',
        sectionId: playlistManagerSection ? playlistManagerSection.id : 'not found'
    });

    // Check if we're on a page with playlist functionality
    if (!playlistManagerToggle || !playlistManagerSection) {
        console.log('Not on a page with playlist manager components');
        return;
    }

    console.log('Initializing playlist manager components');

    // Log initial display state
    const initialDisplayState = window.getComputedStyle(playlistManagerSection).display;
    console.log('Initial playlist section display state:', initialDisplayState);

    // Set up the toggle button - create a NEW event listener that won't conflict
    // First remove any existing listeners by cloning the element
    const newToggle = playlistManagerToggle.cloneNode(true);
    playlistManagerToggle.parentNode.replaceChild(newToggle, playlistManagerToggle);

    // Now add our event listener to the new element
    newToggle.addEventListener('click', function() {
        console.log('Playlist manager toggle clicked');

        // Close tag manager if it's open
        const tagManagerSection = document.getElementById('tagManagerSection');
        const tagManagerToggle = document.getElementById('tagManagerToggle');
        const newTagForm = document.getElementById('newTagForm');
        if (tagManagerSection) {
            tagManagerSection.style.display = 'none';
            if (newTagForm) newTagForm.style.display = 'none';
            if (tagManagerToggle) tagManagerToggle.classList.remove('active');
        }

        // Get CURRENT visibility state
        const isVisible = window.getComputedStyle(playlistManagerSection).display !== 'none';
        console.log('Current visibility state before toggle:', isVisible);

        // Toggle playlist manager visibility with DIRECT style changes
        playlistManagerSection.style.display = isVisible ? 'none' : 'flex';
        newToggle.classList.toggle('active', !isVisible); // Toggle active class based on new state

        // Log the new state
        console.log('New display style after toggle:', playlistManagerSection.style.display);

        // Initialize when showing
        if (!isVisible) {
            console.log('Opening playlist manager, initializing components');
            initPlaylistComponents();
        }
    });

    // Set up the new playlist button
    const newPlaylistBtn = document.getElementById('newPlaylistBtn');
    const playlistEditModal = document.getElementById('playlistEditModal');
    const editPlaylistForm = document.getElementById('editPlaylistForm');
    const savePlaylistEditBtn = document.getElementById('savePlaylistEditBtn');
    const closePlaylistEditBtn = document.getElementById('closePlaylistEditBtn');

    if (newPlaylistBtn) {
        newPlaylistBtn.addEventListener('click', () => {
            console.log('New playlist button clicked');
            if (typeof showPlaylistEditModal === 'function') {
                showPlaylistEditModal({ id: null, name: '' });
            } else {
                console.error('showPlaylistEditModal function not found');
            }
        });
    }

    // Set up the edit modal
    if (playlistEditModal) {
        // Close modal on background click
        playlistEditModal.addEventListener('click', e => {
            if (e.target === playlistEditModal) {
                if (typeof hidePlaylistEditModal === 'function') {
                    hidePlaylistEditModal();
                } else {
                    playlistEditModal.style.display = 'none';
                }
            }
        });

        // Handle form submission
        if (editPlaylistForm) {
            editPlaylistForm.addEventListener('submit', e => {
                e.preventDefault();
                console.log('Playlist form submitted');
                if (typeof savePlaylistChanges === 'function') {
                    savePlaylistChanges();
                } else {
                    console.error('savePlaylistChanges function not found');
                }
            });
        }

        // Handle save button click
        if (savePlaylistEditBtn) {
            savePlaylistEditBtn.addEventListener('click', e => {
                e.preventDefault();
                console.log('Save button clicked');
                if (typeof savePlaylistChanges === 'function') {
                    savePlaylistChanges();
                } else {
                    console.error('savePlaylistChanges function not found');
                }
            });
        }

        // Handle close button click
        if (closePlaylistEditBtn) {
            closePlaylistEditBtn.addEventListener('click', () => {
                if (typeof hidePlaylistEditModal === 'function') {
                    hidePlaylistEditModal();
                } else {
                    playlistEditModal.style.display = 'none';
                }
            });
        }
    }

    // Initialize search bar
    function initPlaylistComponents() {
        // First initialize search
        const playlistHeader = document.querySelector('#playlistManagerSection .section-header');
        if (playlistHeader && !playlistHeader.querySelector('.playlist-search-wrapper')) {
            console.log('Adding playlist search component');

            const searchWrapper = document.createElement('div');
            searchWrapper.className = 'playlist-search-wrapper';
            searchWrapper.innerHTML = `
                <div class="bx--search" role="search">
                    <svg class="bx--search-magnifier" width="16" height="16" viewBox="0 0 16 16">
                        <path d="M6.5 12a5.5 5.5 0 1 0 0-11 5.5 5.5 0 0 0 0 11zm4.936-1.27l4.563 4.557-.707.708-4.563-4.558a6.5 6.5 0 1 1 .707-.707z" fill="currentColor"></path>
                    </svg>
                    <input type="text" class="bx--search-input" placeholder="Search playlists" aria-label="Search playlists">
                </div>
            `;

            const searchInput = searchWrapper.querySelector('.bx--search-input');
            searchInput.addEventListener('input', e => {
                if (typeof filterPlaylists === 'function') {
                    filterPlaylists(e.target.value.trim());
                } else {
                    console.error('filterPlaylists function not found');
                }
            });

            playlistHeader.insertBefore(searchWrapper, playlistHeader.firstChild);
        }

        // Then load playlists
        if (typeof loadPlaylists === 'function') {
            loadPlaylists();
        } else {
            console.error('loadPlaylists function not found');
        }
    }
});