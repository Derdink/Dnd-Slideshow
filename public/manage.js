/**
 * manage.js
 * Implements image management functionality based on user stories:
 * - Image Management User Story 2: View and manage uploaded images
 * - Image Management User Story 3: Performant image table with pagination
 * - Image Management User Story 4: Select multiple images for bulk actions
 * - Image Management User Story 5: Bulk actions on selected images
 * - Image Management User Story 6: Edit and delete image entries
 * - Image Management User Story 7: Play specific images
 * - Image Management User Story 8: Delete tags on images
 * - Image Management User Story 9: Search through images
 * - Image Management User Story 10: Filter images by tags and playlists
 * - Image Management User Story 11: Edit and manage tags
 * - Image Management User Story 12: Manage playlists
 */

// public/manage.js
// Main orchestrator for the management page

import { state, updateState } from './state.js';
import {
    fetchImages,
    fetchTags,
    fetchPlaylists,
    navigateSlideshow,
    playSelectedPlaylist,
    playSelectedTags,
    playSelectedImagesAPI
    // API functions used directly by modules are imported within those modules
    // e.g., savePlaylists, updateImage, updateTag, deleteImageById etc.
} from '../api.js';
import {
    initFilters,
    setFiltersDOMCache,
    displayTagsInFilter,
    updateFilterTagAvailability
} from './manage/filters.js';
import {
    setPaginationDOMCache,
    updatePaginationControls
} from './manage/pagination.js';
import {
    setTagManagerDOMCache,
    displayTagsInManager,
    attachTagManagerEventListeners
} from './manage/tagManager.js';
import {
    setPlaylistManagerDOMCache,
    displayPlaylistsInManager,
    displayPlaylistsForSelection,
    attachPlaylistManagerEventListeners,
    displayPlaylistsInFilter
} from './manage/playlistManager.js';
import {
    setSettingsDOMCache,
    initSettingsTab,
    displayTagsForSelection
} from './manage/settings.js';
import {
    setUploadDOMCache,
    initUploadTab
} from './manage/upload.js';
import {
    setModalsDOMCache,
    initModals
} from './manage/modals.js';
import {
    setImageTableDOMCache,
    displayImagesInTable,
    updateSortArrows,
    initImageTable
} from './manage/imageTable.js';
import {
    initImageManager,
    refreshImageData,
    setImageManagerDOMCache
} from './manage/imageManager.js';
import {
    initTagManager
} from './manage/tagManager.js';
import {
    initPlaylistManager
} from './manage/playlistManager.js';

// --- Main DOM Cache ---
const dom = {};

/**
 * Caches DOM elements for performance
 * Optimizes Image Management User Story 3 performance
 */
function cacheDOMElements() {
    // General & Filters
    dom.searchInput = document.getElementById('search');
    dom.filterBtn = document.getElementById('filterBtn');
    dom.filterTabsWrapper = document.getElementById('filterTabsWrapper'); // Needed?
    dom.tagFilterDropdown = document.getElementById('tagFilterDropdown');
    dom.playlistFilterContainer = document.querySelector('.playlistsContainer'); // Container for playlist filters

    // Image Table & Pagination
    dom.imageTable = document.getElementById('imageTable');
    dom.imageTableHead = document.querySelector('#imageTable thead');
    dom.imageTableBody = document.querySelector('#imageTable tbody');
    console.log('Caching imageTableBody:', dom.imageTableBody); // DEBUG LOG
    dom.headerSelectCheckbox = document.getElementById('imageSelectAll'); // CORRECTED ID
    dom.paginationContainer = document.getElementById('pagination');
    dom.bulkDeleteBtn = document.getElementById('bulkDelete');
    console.log('Caching bulkDeleteBtn:', dom.bulkDeleteBtn); // DEBUG LOG
    dom.playSelectBtn = document.getElementById('playSelectBtn');
    console.log('Caching playSelectBtn:', dom.playSelectBtn); // DEBUG LOG

    // Tag Manager
    dom.tagManagerToggle = document.getElementById('tagManagerToggle');
    dom.tagManagerSection = document.getElementById('tagManagerSection');
    dom.tagManagerContainer = document.getElementById('tagManagerContainer');
    dom.tagManagerList = document.getElementById('tagManagerList'); // Assuming this ID exists or is created
    dom.newTagForm = document.getElementById('newTagForm');
    dom.newTagNameInput = document.getElementById('newTagName');

    // Playlist Manager
    dom.playlistManagerToggle = document.getElementById('playlistManagerToggle');
    dom.playlistManagerSection = document.getElementById('playlistManagerSection');
    dom.playlistList = document.getElementById('playlistList');
    dom.newPlaylistForm = document.getElementById('newPlaylistForm');
    dom.newPlaylistNameInput = document.getElementById('newPlaylistName');
    dom.playlistSearchInput = document.getElementById('playlistSearch'); // Search within the manager

    // Settings Tab
    dom.settingsSection = document.getElementById('settingsSection');
    dom.settingsDetails = document.getElementById('settings-details'); // The collapsible part
    dom.settingsToggle = document.getElementById('settingsToggle');
    dom.minutesInput = document.getElementById('minutes');
    dom.secondsInput = document.getElementById('seconds');
    dom.orderRandomBtn = document.getElementById('orderRandom');
    dom.orderAlphaBtn = document.getElementById('orderAlphabetical');
    dom.orderGroupsBtn = document.getElementById('orderGroups');
    dom.saveSettingsBtn = document.getElementById('saveSettingsBtn');
    dom.saveMessage = document.getElementById('saveMessage');
    dom.showTextOverlayToggle = document.getElementById('showTextOverlayToggle');
    dom.settingsPlaylistList = document.getElementById('settingsPlaylistList'); // For playlists in settings
    dom.playTagsBtn = document.getElementById('playTagsBtn'); // Play selected tags button
    dom.tagSelectionContainer = document.getElementById('tagSelectionContainer'); // Tags in settings

    // Upload Tab
    dom.dropArea = document.getElementById('dropArea');
    dom.selectFilesBtn = document.getElementById('selectFiles');
    dom.fileInput = document.getElementById('fileInput');
    dom.uploadStatus = document.getElementById('uploadStatus');

    // Modals
    dom.editModal = document.getElementById('editModal');
    dom.editTitleInput = document.getElementById('editTitle');
    dom.editDescriptionInput = document.getElementById('editDescription');
    dom.saveEditBtn = document.getElementById('saveEditBtn');
    dom.closeEditBtn = document.getElementById('closeEditBtn');

    dom.tagEditModal = document.getElementById('tagEditModal');
    dom.editTagNameInput = document.getElementById('editTagName');
    dom.saveTagEditBtn = document.getElementById('saveTagEditBtn');
    dom.closeTagEditBtn = document.getElementById('closeTagEditBtn');

    dom.playlistEditModal = document.getElementById('playlistEditModal');
    dom.editPlaylistNameInput = document.getElementById('editPlaylistName');
    dom.savePlaylistEditBtn = document.getElementById('savePlaylistEditBtn');
    dom.closePlaylistEditBtn = document.getElementById('closePlaylistEditBtn');

    // Carbon Tabs
    dom.settingsTabs = document.querySelector('#settings-details .bx--tabs');

    // Header Slideshow Controls (Corrected IDs based on manage.html)
    dom.headerPrevBtn = document.getElementById('headerPrevBtn'); 
    dom.headerPlayBtn = document.getElementById('headerPlayBtn'); // Play/Pause
    dom.headerResetBtn = document.getElementById('headerResetBtn');
    dom.headerNextBtn = document.getElementById('headerNextBtn');

    console.log("DOM elements cached:", dom);
}

/**
 * Initializes the manage page functionality
 * Sets up all required components based on user stories
 */
export async function initManage() {
    console.log('>>> initManage: START <<<'); // ADD START LOG
    // REMOVED document.readyState check - rely on DOMContentLoaded listener in HTML
    
    cacheDOMElements(); // Cache elements first

    // Pass cached DOM elements to modules
    setFiltersDOMCache(dom);
    setPaginationDOMCache(dom);
    setTagManagerDOMCache(dom);
    setPlaylistManagerDOMCache(dom);
    setSettingsDOMCache(dom);
    setUploadDOMCache(dom);
    setModalsDOMCache(dom);
    setImageTableDOMCache(dom);
    setImageManagerDOMCache(dom); // Pass the cached dom

    // Initialize modules (These should now have the cached DOM)
    initFilters();
    initImageManager(); 
    initTagManager();
    initPlaylistManager();
    attachTagManagerEventListeners(); 
    initSettingsTab();
    initUploadTab();
    initModals();
    initImageTable();
    initializeCarbonTabs(); 
    attachMainEventListeners(); 

    // Initial data fetch
    await refreshManageData();

    console.log('>>> initManage: END <<<'); // ADD END LOG
    console.log('Management Page Initialized.');
}

/**
 * Refreshes the manage page data
 * Used by Image Management User Stories 2-12 for data updates
 */
export async function refreshManageData() {
    console.log('Refreshing non-image management data (tags, playlists)...');

    try {
        // Fetch non-image data concurrently
        const [tags, playlists] = await Promise.all([
            fetchTags(),
            fetchPlaylists()
        ]);

        // Update global state for tags and playlists
        state.tags = tags || [];
        state.playlists = playlists || [];

        // Update UI components that depend only on tags/playlists
        displayTagsInFilter(tags);
        displayPlaylistsInFilter(); // Import from playlistManager.js
        displayTagsInManager(tags);
        displayPlaylistsInManager(); // Uses state.playlists internally
        displayPlaylistsForSelection();
        displayTagsForSelection(); // ADDED: Call to update settings tag selection
        // NOTE: The comment about updating on initSettingsTab is now less relevant

        console.log('Non-image data refresh complete. Triggering image refresh...');

        // Now, trigger the image refresh using the image manager
        // This will use the current state (filters, sort, page) set elsewhere
        await refreshImageData();
        
        // Call tag availability update *after* image data and available tags state are updated
        updateFilterTagAvailability(); 

    } catch (error) {
        console.error('Error refreshing tags/playlists data:', error);
        // Display an error message? Maybe not here, let image refresh handle UI errors.
    }
}

/**
 * Handles image selection changes
 * Implements Image Management User Story 4:
 * - Select multiple images
 * - Persist selection across pages
 * - Select/deselect all functionality
 */
function handleImageSelectionChange(event) {
    // ... existing code ...
}

/**
 * Handles bulk delete action
 * Implements Image Management User Story 5:
 * - Delete all selected images
 * - Warning prompt before deletion
 * - Remove from server and database
 */
async function handleBulkDelete() {
    // ... existing code ...
}

/**
 * Handles individual image deletion
 * Implements Image Management User Story 6:
 * - Delete individual images
 * - Confirmation prompt
 * - Remove from server and database
 */
async function handleDeleteImage(imageId) {
    // ... existing code ...
}

/**
 * Handles image editing
 * Implements Image Management User Story 6:
 * - Edit image title
 * - Add/edit description
 * - Update database
 */
async function handleEditImage(imageId) {
    // ... existing code ...
}

/**
 * Handles playing a specific image
 * Implements Image Management User Story 7:
 * - Play individual image
 * - Pause slideshow
 * - Transition from current image
 */
async function handlePlayImage(imageId) {
    // ... existing code ...
}

/**
 * Handles tag deletion from images
 * Implements Image Management User Story 8:
 * - Delete tags from images
 * - Bulk tag removal from selected images
 */
async function handleDeleteTagFromImage(tagId, imageId) {
    // ... existing code ...
}

/**
 * Handles search functionality
 * Implements Image Management User Story 9:
 * - Search through images
 * - Filter based on search term
 * - Maintain selected images in results
 */
function handleSearch(event) {
    // ... existing code ...
}

/**
 * Handles filter functionality
 * Implements Image Management User Story 10:
 * - Filter by tags
 * - Filter by playlists
 * - Clear filters
 */
function handleFilter(event) {
    // ... existing code ...
}

/**
 * Handles tag management
 * Implements Image Management User Story 11:
 * - Create/edit/delete tags
 * - Assign colors to tags
 * - Apply tags to selected images
 */
function handleTagManagement(event) {
    // ... existing code ...
}

/**
 * Handles playlist management
 * Implements Image Management User Story 12:
 * - Create/edit/delete playlists
 * - Add/remove images from playlists
 * - Set playlist visibility
 */
function handlePlaylistManagement(event) {
    // ... existing code ...
}

/**
 * Handles responsive layout changes
 * Implements Image Management User Story 2:
 * - Adjust layout for different screen sizes
 * - Show/hide columns based on viewport
 */
function handleResponsiveLayout() {
    // ... existing code ...
}

/**
 * Initializes the Carbon Design System tabs within the settings section.
 */
function initializeCarbonTabs() {
    if (!dom.settingsTabs) return;
    const tabList = dom.settingsTabs.querySelector('.bx--tabs__nav');
    const tabs = tabList?.querySelectorAll('.bx--tabs__nav-item');
    const panels = dom.settingsTabs.parentElement?.querySelectorAll('.bx--tab-panel'); // Panels are siblings of tabs
    const trigger = dom.settingsTabs.querySelector('.bx--tabs-trigger');
    const triggerText = trigger?.querySelector('.bx--tabs-trigger-text');

    if (!tabs || !panels || panels.length !== tabs.length || !trigger || !triggerText) {
        console.warn('Carbon tabs elements not found or mismatched.');
        return;
    }

    const setupTab = (tab, index) => {
        tab.addEventListener('click', () => {
            // Deselect all
            tabs.forEach(t => t.classList.remove('bx--tabs__nav-item--selected'));
            panels.forEach(p => p.setAttribute('aria-hidden', 'true'));

            // Select clicked
            tab.classList.add('bx--tabs__nav-item--selected');
            if (panels[index]) panels[index].setAttribute('aria-hidden', 'false');

            // Update trigger text (for mobile)
             triggerText.textContent = tab.querySelector('.bx--tabs__nav-link')?.textContent || 'Select Tab';
             tabList.classList.add('bx--tabs__nav--hidden'); // Close dropdown
        });
    };

    tabs.forEach(setupTab);

    // Mobile trigger functionality
    trigger.addEventListener('click', (event) => {
        tabList.classList.toggle('bx--tabs__nav--hidden');
        event.stopPropagation(); // Prevent body click closing immediately
    });

    // Close dropdown if clicking outside
    document.addEventListener('click', (event) => {
        if (!dom.settingsTabs.contains(event.target)) {
            tabList.classList.add('bx--tabs__nav--hidden');
        }
    });

    // Set initial state
    const selectedTab = tabList.querySelector('.bx--tabs__nav-item--selected');
    triggerText.textContent = selectedTab?.querySelector('.bx--tabs__nav-link')?.textContent || 'Select Tab';
}

/**
 * Handles clicks on the global slideshow control buttons in the header.
 * @param {Event} event The click event.
 */
async function handleSlideshowControlClick(event) {
    const button = event.target.closest('button');
    if (!button) return;

    let action = null;
    let apiCallPromise = null; // To store the promise for the API call

    // Determine action based on button ID
    switch (button.id) {
        case 'headerPrevBtn': 
            action = 'prev'; 
            apiCallPromise = navigateSlideshow(action); // Control existing slideshow
            break;
        case 'headerPlayBtn': 
            action = 'togglePause'; 
            apiCallPromise = navigateSlideshow(action); // Control existing slideshow
            break;
        case 'headerNextBtn': 
            action = 'next'; 
            apiCallPromise = navigateSlideshow(action); // Control existing slideshow
            break;
        case 'headerResetBtn': // This is now the main "Play" button
            action = 'playSource'; // Logical action name
            console.log('Header Control: Play Source button clicked.');

            // --- Determine source based on UI selections ---
            const selectedImageIds = state.management.selectedImageIds || new Set();
            const selectedSettingPlaylistIds = state.management.selectedSettingPlaylistIds || []; // Read from global state
            const selectedTags = state.management.selectedSettingTags || []; 
            const playlistIdToPlay = selectedSettingPlaylistIds.length > 0 ? selectedSettingPlaylistIds[0] : null;

            // *** PRIORITY 1: Play selected images ***
            if (selectedImageIds.size > 0) {
                console.log(`  - Initiating slideshow from ${selectedImageIds.size} SELECTED IMAGE(S).`);
                const idsToPlay = Array.from(selectedImageIds);
                apiCallPromise = playSelectedImagesById(idsToPlay); // Call helper function
                // Clear other selections when playing specific images
                updateState('management', { selectedSettingPlaylistIds: [], selectedSettingTags: [] });
            }
            // *** PRIORITY 2: Play selected playlist ***
            else if (playlistIdToPlay !== null) { 
                console.log(`  - Initiating slideshow from PLAYLIST ID: ${playlistIdToPlay}`);
                apiCallPromise = playSelectedPlaylist(playlistIdToPlay); 
                 updateState('management', { selectedSettingTags: [] }); 
            }
            // *** PRIORITY 3: Play selected tags *** 
            else if (selectedTags.length > 0) {
                console.log(`  - Initiating slideshow from TAGS: ${selectedTags.join(', ')}`);
                console.log('[handleSlideshowControlClick] Calling playSelectedTags with tags:', selectedTags);
                apiCallPromise = playSelectedTags(selectedTags);
                 updateState('management', { selectedSettingPlaylistIds: [] }); 
            }
            // *** PRIORITY 4: Play all *** 
            else {
                console.log('  - Initiating slideshow with ALL images.');
                apiCallPromise = playSelectedTags([]); // Assumes playSelectedTags([]) triggers 'all'
            }
            break; // End of 'headerResetBtn' case
    }

    if (!action) {
        console.warn('Unknown slideshow control button clicked:', button.id);
        return;
    }

    console.log(`Header Control: Action=${action}`);
    button.classList.add('bx--btn--disabled'); // Disable temporarily
    button.setAttribute('disabled', true);

    try {
        if (apiCallPromise) {
            await apiCallPromise; // Execute the determined API call
        } else {
            console.warn(`No API call defined for action: ${action}`);
        }
    } catch (error) {
        console.error(`Error performing slideshow action '${action}':`, error);
        alert(`Failed to perform action: ${action}. Check console.`);
    } finally {
        // Re-enable button after a short delay
        setTimeout(() => {
            button.classList.remove('bx--btn--disabled');
            button.removeAttribute('disabled');
        }, 250); 
    }
}

/**
 * Attaches event listeners for the main management page components.
 */
function attachMainEventListeners() {
    // --- Centralized Header Toggles --- 
    const toggleHandler = (button, section, displayFunc) => {
        if (!button || !section) return;
        button.addEventListener('click', () => {
            const isOpening = !button.classList.contains('active'); // Will it be active AFTER toggle?
            
            if (isOpening) {
                closeOtherHeaderSections(button); // Close others BEFORE toggling this one
                button.classList.add('active');
                section.style.display = section === dom.filterTabsWrapper ? 'grid' : 'block'; 
                console.log(`Accordion: Opening section for button:`, button.id);
                // Call the display/refresh function for the opened section
                if (displayFunc) displayFunc(); 
            } else {
                button.classList.remove('active');
                section.style.display = 'none';
                console.log(`Accordion: Closing section for button:`, button.id);
            }
        });
    };

    // Pass the relevant display function to refresh content when opening
    toggleHandler(dom.playlistManagerToggle, dom.playlistManagerSection, displayPlaylistsInManager);
    toggleHandler(dom.tagManagerToggle, dom.tagManagerContainer, displayTagsInManager);
    toggleHandler(dom.filterBtn, dom.filterTabsWrapper, () => { 
        displayTagsInFilter(state.tags || []);
        displayPlaylistsInFilter(state.playlists || []);
    });
    // --- End Centralized Header Toggles ---

    // Attach listeners for header slideshow controls
    if (dom.headerPrevBtn) dom.headerPrevBtn.addEventListener('click', handleSlideshowControlClick);
    if (dom.headerPlayBtn) dom.headerPlayBtn.addEventListener('click', handleSlideshowControlClick);
    if (dom.headerResetBtn) dom.headerResetBtn.addEventListener('click', handleSlideshowControlClick);
    if (dom.headerNextBtn) dom.headerNextBtn.addEventListener('click', handleSlideshowControlClick);

    // Listener for the main settings toggle
     if (dom.settingsToggle && dom.settingsDetails) {
        dom.settingsToggle.addEventListener('click', () => {
            const isActive = dom.settingsToggle.classList.toggle('active');
            dom.settingsDetails.style.display = isActive ? 'block' : 'none';
            // Refresh settings tab content ONLY when opened?
            // Might be better to refresh tags/playlists inside initSettingsTab called by refreshManageData
             if(isActive) {
                 // If needed, explicitly tell settings tab to re-render lists
                 // displayTagsForSelection();
                 // displayPlaylistsForSelection();
             }
        });
    }

    // ... other main event listeners ...
}

// --- Helper Function for Accordion Behavior ---
/**
 * Closes header sections other than the one corresponding to the activeButton.
 * @param {HTMLElement} activeButton - The button element that was just activated.
 */
function closeOtherHeaderSections(activeButton) {
    const sections = [
        { button: dom.playlistManagerToggle, section: dom.playlistManagerSection, displayFunc: null }, 
        { button: dom.tagManagerToggle, section: dom.tagManagerContainer, displayFunc: null }, 
        { button: dom.filterBtn, section: dom.filterTabsWrapper, displayFunc: null } 
    ];

    sections.forEach(item => {
        // If this button is not the one that was just activated AND it is currently active
        if (item.button && item.section && item.button !== activeButton && item.button.classList.contains('active')) {
            item.button.classList.remove('active');
            item.section.style.display = 'none'; // This will now correctly target tagManagerContainer
            console.log(`Accordion: Closing section for button:`, item.button.id);
        }
    });
}

// *** NEW HELPER FUNCTION ***
/**
 * Fetches details for selected image IDs and starts the slideshow.
 * @param {number[]} ids - Array of image IDs to play.
 */
async function playSelectedImagesById(ids) {
    console.log(`[playSelectedImagesById] Fetching details for ${ids.length} images...`);
    if (!ids || ids.length === 0) return Promise.resolve(); // Should not happen based on caller check

    try {
        // Fetch full image details using the existing fetchImages API function
        // We assume fetchImages can handle the 'ids' filter and the server returns tags correctly.
        // We fetch all selected IDs without pagination (limit -1 or a large number).
        const imageData = await fetchImages({ 
            limit: -1, // Fetch all matching IDs
            filters: { 
                ids: ids, 
                includeHidden: false // Usually don't play hidden even if selected? User expectation?
            } 
        });
        
        const imagesToPlay = imageData.images || [];

        if (imagesToPlay.length === 0) {
            console.warn('[playSelectedImagesById] No playable images found for the selected IDs (check if hidden).');
            alert('No playable images found for the selection.');
            return Promise.resolve(); // Resolve gracefully
        }

        console.log(`[playSelectedImagesById] Fetched ${imagesToPlay.length} images. Initiating play...`);

        // Get current slideshow settings from state
        const speed = state.slideshow.transitionTime ?? 3;
        const order = state.slideshow.order ?? 'random'; 

        // Use the existing playSelectedImagesAPI which calls POST /api/updateSlideshow
        // This ensures the server emits the 'playSelect' event correctly
        return playSelectedImagesAPI(imagesToPlay, speed, order);

    } catch (error) {
        console.error('[playSelectedImagesById] Error fetching or playing selected images:', error);
        alert(`Error starting slideshow for selected images: ${error.message}`);
        return Promise.reject(error); // Propagate error if needed
    }
}
// *** END NEW HELPER FUNCTION *** 