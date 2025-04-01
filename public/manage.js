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
    initSettingsTab
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
    dom.headerSelectCheckbox = document.getElementById('headerSelect');
    dom.paginationContainer = document.getElementById('pagination');
    dom.bulkDeleteBtn = document.getElementById('bulkDelete');
    dom.playSelectBtn = document.getElementById('playSelectBtn'); // Play selected button

    // Tag Manager
    dom.tagManagerToggle = document.getElementById('tagManagerToggle');
    dom.tagManagerSection = document.getElementById('tagManagerSection');
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

    // Header Slideshow Controls (Assuming these IDs exist in manage.html)
    dom.slideshowPrevBtn = document.getElementById('slideshowPrevBtn');
    dom.slideshowPlayPauseBtn = document.getElementById('slideshowPlayPauseBtn');
    dom.slideshowResetBtn = document.getElementById('slideshowResetBtn');
    dom.slideshowNextBtn = document.getElementById('slideshowNextBtn');

    console.log("DOM elements cached:", dom);
}

/**
 * Initializes the manage page functionality
 * Sets up all required components based on user stories
 */
export async function initManage() {
    console.log('Initializing Management Page...');
    cacheDOMElements();

    // Pass cached DOM elements to modules
    setFiltersDOMCache(dom);
    setPaginationDOMCache(dom);
    setTagManagerDOMCache(dom);
    setPlaylistManagerDOMCache(dom);
    setSettingsDOMCache(dom);
    setUploadDOMCache(dom);
    setModalsDOMCache(dom);
    setImageTableDOMCache(dom);
    setImageManagerDOMCache(dom);

    // Initialize modules
    initFilters();
    initImageManager(); // Initialize the image manager
    initTagManager();
    initPlaylistManager();
    attachTagManagerEventListeners();
    attachPlaylistManagerEventListeners();
    initSettingsTab();
    initUploadTab();
    initModals();
    initImageTable();
    initializeCarbonTabs(); // Initialize Carbon tabs
    attachMainEventListeners(); // Attach listeners for main page elements (like header controls)

    // Initial data fetch
    await refreshManageData();

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
        // NOTE: displayTagsForSelection & displayPlaylistsForSelection in settings.js
        // should also be updated if the settings panel is open, or on initSettingsTab

        console.log('Non-image data refresh complete. Triggering image refresh...');

        // Now, trigger the image refresh using the image manager
        // This will use the current state (filters, sort, page) set elsewhere
        await refreshImageData();

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
    switch (button.id) {
        case 'slideshowPrevBtn': action = 'prev'; break;
        case 'slideshowPlayPauseBtn': action = 'togglePause'; break;
        case 'slideshowResetBtn': action = 'reset'; break;
        case 'slideshowNextBtn': action = 'next'; break;
    }

    if (!action) {
        console.warn('Unknown slideshow control button clicked:', button.id);
        return;
    }

    console.log(`Header Control: Action=${action}`);
    button.classList.add('bx--btn--disabled'); // Disable temporarily
    button.setAttribute('disabled', true);

    try {
        await navigateSlideshow(action);
        // Optional: Update button appearance based on response (e.g., play/pause icon)
        // This might be better handled via socket events indicating slideshow state change.
    } catch (error) {
        console.error(`Error performing slideshow action '${action}':`, error);
        // Provide user feedback if necessary (e.g., Carbon notification)
        alert(`Failed to perform action: ${action}. Check console.`);
    } finally {
        // Re-enable button after a short delay to prevent rapid clicks
        setTimeout(() => {
            button.classList.remove('bx--btn--disabled');
            button.removeAttribute('disabled');
        }, 250); // 250ms delay
    }
}

/**
 * Attaches event listeners for the main management page components.
 */
function attachMainEventListeners() {
    // Example: Attach listener for the search input if handled here
    // if (dom.searchInput) {
    //     dom.searchInput.addEventListener('input', handleSearchInput);
    // }

    // Attach listeners for header slideshow controls
    if (dom.slideshowPrevBtn) dom.slideshowPrevBtn.addEventListener('click', handleSlideshowControlClick);
    if (dom.slideshowPlayPauseBtn) dom.slideshowPlayPauseBtn.addEventListener('click', handleSlideshowControlClick);
    if (dom.slideshowResetBtn) dom.slideshowResetBtn.addEventListener('click', handleSlideshowControlClick);
    if (dom.slideshowNextBtn) dom.slideshowNextBtn.addEventListener('click', handleSlideshowControlClick);

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