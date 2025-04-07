/**
 * settings.js
 * Implements slideshow settings functionality based on user stories:
 * - Slideshow Management User Story 1: Manage slideshow settings
 * - Slideshow Management User Story 2: Slideshow controls
 * - Slideshow Management User Story 3: Tag selection for slideshow
 * - Slideshow Management User Story 4: Customize sequence settings
 */

// public/manage/settings.js
// Logic for the Play Settings tab

import { state, updateState } from '../state.js';
import { updateSlideshowSettings, playSelectedTags, playSelectedPlaylist } from '../api.js';
import '../socket-client.js'; // Import socket-client.js which exposes socket as window.socket
import { STORAGE_KEYS, DEFAULTS, UI } from '../config.js';
import { getContentColorForBackground } from './utils.js'; // Need this
const DEFAULT_TAG_COLOR = '#cccccc'; // Define if not already present

// DOM elements cached by parent manage.js module
let dom = {};
// Get the socket from the global window object
const socket = window.socket;

// Temporary state for tag selection within the settings panel
let settingSelectedTagNames = new Set();

export function setSettingsDOMCache(cachedDom) {
    dom = cachedDom;
}

/**
 * Loads current slideshow settings into form fields
 * Used by Slideshow Management User Story 1 for settings display
 */
function loadSettingsValues() {
    if (!dom.minutesInput || !dom.secondsInput || !dom.orderRandomBtn || !dom.orderAlphaBtn || !dom.orderGroupsBtn) {
        console.warn('Settings DOM elements not fully cached.');
        return;
    }

    // Load transition time
    const currentTransitionTime = state.slideshow?.transitionTime ?? 
        parseFloat(localStorage.getItem(STORAGE_KEYS.TRANSITION_TIME)) ?? 
        DEFAULTS.TRANSITION_TIME;
    const totalSeconds = Math.max(0, Math.round(currentTransitionTime));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    dom.minutesInput.value = minutes;
    dom.secondsInput.value = seconds;

    // Load order
    const currentOrder = state.slideshow?.order ?? 
        localStorage.getItem(STORAGE_KEYS.SLIDESHOW_ORDER) ?? 
        DEFAULTS.SLIDESHOW_ORDER;
    updateOrderButtonSelection(currentOrder);

    // Load Show Text Overlay state
    const currentShowText = state.slideshow?.showTextOverlay ?? 
        (localStorage.getItem(STORAGE_KEYS.SHOW_TEXT_OVERLAY) === 'true') ?? 
        DEFAULTS.SHOW_TEXT_OVERLAY;
    if (dom.showTextOverlayToggle) {
        dom.showTextOverlayToggle.checked = currentShowText;
    } else {
        console.warn('Show Text Overlay toggle not found in DOM cache.');
    }
}

/**
 * Updates visual selection state of order buttons
 * Implements Slideshow Management User Story 4:
 * - Random order
 * - Alphabetical order
 * - Tag-based order
 */
function updateOrderButtonSelection(selectedOrder) {
    const buttons = {
        random: dom.orderRandomBtn,
        alphabetical: dom.orderAlphaBtn,
        groups: dom.orderGroupsBtn
    };

    // Reset all buttons (remove primary, add secondary)
    Object.values(buttons).forEach(btn => {
        if (btn) {
            btn.classList.remove('bx--btn--primary');
            btn.classList.add('bx--btn--secondary');
        }
    });

    // Activate the selected button (remove secondary, add primary)
    const selectedButton = buttons[selectedOrder];
    if (selectedButton) {
        selectedButton.classList.remove('bx--btn--secondary');
        selectedButton.classList.add('bx--btn--primary');
    }
}

/**
 * Handles order button clicks
 * Used by Slideshow Management User Story 4 for sequence ordering
 */
function handleOrderButtonClick(event) {
    const clickedButton = event.target.closest('button');
    if (!clickedButton) return;

    const newOrder = clickedButton.id.replace('order', '').toLowerCase();
    updateOrderButtonSelection(newOrder);
    // No need to save immediately, wait for the main save button
}

/**
 * Handles saving slideshow settings
 * Implements Slideshow Management User Story 1:
 * - Auto-update slideshow on changes
 * - Save transition duration
 * - Save sequence order
 */
async function handleSaveSettings() {
    if (!dom.minutesInput || !dom.secondsInput || !dom.orderRandomBtn || !dom.showTextOverlayToggle) {
        console.warn('Cannot save settings, DOM elements missing.');
        return;
    }

    // Get transition time
    const minutes = parseInt(dom.minutesInput.value, 10) || 0;
    const seconds = parseInt(dom.secondsInput.value, 10) || 0;
    const newTransitionTime = Math.max(1, (minutes * 60) + seconds);

    // Get order
    let newOrder = DEFAULTS.SLIDESHOW_ORDER;
    if (dom.orderAlphaBtn?.classList.contains('bx--btn--primary')) {
        newOrder = 'alphabetical';
    } else if (dom.orderGroupsBtn?.classList.contains('bx--btn--primary')) {
        newOrder = 'groups';
    }

    // Get Show Text Overlay state
    const newShowTextOverlay = dom.showTextOverlayToggle.checked;

    console.log(`Saving settings: Time=${newTransitionTime}s, Order=${newOrder}, ShowText=${newShowTextOverlay}`);

    try {
        updateState('slideshow', {
            transitionTime: newTransitionTime,
            order: newOrder,
            showTextOverlay: newShowTextOverlay
        });

        localStorage.setItem(STORAGE_KEYS.TRANSITION_TIME, newTransitionTime.toString());
        localStorage.setItem(STORAGE_KEYS.SLIDESHOW_ORDER, newOrder);
        localStorage.setItem(STORAGE_KEYS.SHOW_TEXT_OVERLAY, newShowTextOverlay.toString());

        await updateSlideshowSettings(newTransitionTime, newOrder, newShowTextOverlay);
        showSaveConfirmation();

    } catch (error) {
        console.error('Error saving settings:', error);
        alert('Failed to save settings. Please check the console for details.');
    }
}

/**
 * Shows save confirmation message
 * Provides feedback for Slideshow Management User Story 1
 */
function showSaveConfirmation() {
    if (!dom.saveMessage) return;
    dom.saveMessage.style.display = 'flex';
    dom.saveMessage.style.opacity = '1';
    setTimeout(() => {
        dom.saveMessage.style.opacity = '0';
        setTimeout(() => {
            dom.saveMessage.style.display = 'none';
        }, UI.FADE_DURATION);
    }, UI.SAVE_MESSAGE_DURATION);
}

/**
 * Displays available tags for selection as pills.
 */
export function displayTagsForSelection() {
    if (!dom.tagSelectionContainer) {
        console.warn('Tag selection container not found in DOM cache for settings.');
        return;
    }
    dom.tagSelectionContainer.innerHTML = ''; // Clear existing
    // Initialize local set from global state if available
    settingSelectedTagNames = new Set(state.management.selectedSettingTags || []); 
    const allTags = state.tags || [];

    if (allTags.length === 0) {
        dom.tagSelectionContainer.innerHTML = '<p class="bx--type-body-short-01">No tags available.</p>';
        return;
    }

    // --- Add Select/Deselect All Buttons --- 
    const selectAllBtn = createSettingsActionButton('Select All', true, () => { 
        settingSelectedTagNames.clear(); // Clear first
        dom.tagSelectionContainer.querySelectorAll('.settings-tag-pill').forEach(pill => {
            pill.classList.add('selected');
            settingSelectedTagNames.add(pill.dataset.tagName);
        });
        // Update global state
        updateState('management', { selectedSettingTags: Array.from(settingSelectedTagNames) });
    });
    dom.tagSelectionContainer.appendChild(selectAllBtn);

    const deselectAllBtn = createSettingsActionButton('Deselect All', false, () => { 
        dom.tagSelectionContainer.querySelectorAll('.settings-tag-pill.selected').forEach(pill => {
            pill.classList.remove('selected');
        });
        settingSelectedTagNames.clear();
        // Update global state
        updateState('management', { selectedSettingTags: [] });
    });
    dom.tagSelectionContainer.appendChild(deselectAllBtn);

    // Add separator or spacing if needed
    const separator = document.createElement('hr');
    separator.style.width = '100%';
    separator.style.borderTop = '1px solid var(--cds-border-subtle-01)';
    separator.style.margin = 'var(--cds-spacing-03) 0';
    dom.tagSelectionContainer.appendChild(separator);
    // --- --------------------------- ---

    allTags.forEach(tag => {
        const tagName = tag.name;
        const tagColor = tag.color || DEFAULT_TAG_COLOR;
        const contrastColor = getContentColorForBackground(tagColor);

        const pill = document.createElement('div');
        pill.className = 'bx--tag bx--tag--filter settings-tag-pill'; 
        pill.style.backgroundColor = tagColor;
        pill.style.color = contrastColor;
        pill.style.cursor = 'pointer';
        pill.dataset.tagName = tagName; 

        const tagNameElem = document.createElement('span');
        tagNameElem.textContent = tagName;
        pill.appendChild(tagNameElem);
        
        // Set initial selected state based on the (now initialized) local set
        if (settingSelectedTagNames.has(tagName)) {
            pill.classList.add('selected');
        }

        // Click listener to toggle selection
        pill.addEventListener('click', () => {
            const isSelected = pill.classList.toggle('selected');
            if (isSelected) {
                settingSelectedTagNames.add(tagName);
            } else {
                settingSelectedTagNames.delete(tagName);
            }
            // Update global state whenever selection changes
            updateState('management', { selectedSettingTags: Array.from(settingSelectedTagNames) });
        });

        dom.tagSelectionContainer.appendChild(pill);
    });
}

/**
 * Helper to create settings action buttons (Select/Deselect All)
 * @param {string} text - Button text
 * @param {boolean} isPrimary - True for primary style, false for secondary
 * @param {function} onClick - Click handler
 * @returns {HTMLButtonElement}
 */
function createSettingsActionButton(text, isPrimary, onClick) { 
    const btn = document.createElement('button');
    // Use standard Carbon button classes
    btn.className = `bx--btn bx--btn--sm ${isPrimary ? 'bx--btn--primary' : 'bx--btn--secondary'}`;
    btn.type = 'button'; // Explicitly set type
    btn.textContent = text;
    btn.addEventListener('click', onClick);
    return btn;
}

/**
 * Handles play tags button click - Reads selection from pills.
 * NOTE: This function no longer starts playback directly.
 */
async function handlePlayTagsClick() {
    if (!dom.tagSelectionContainer || !dom.playTagsBtn) return;

    // Get selected tags from the temporary set
    const selectedTagNames = Array.from(settingSelectedTagNames);

    if (selectedTagNames.length === 0) {
        alert('Please select at least one tag.'); // Changed message
        return;
    }
    // Update global state (redundant if pill clicks update, but safe)
    updateState('management', { selectedSettingTags: selectedTagNames });
    console.log(`Settings: Tag selection confirmed: ${selectedTagNames.join(', ')}. Use Reset/Play button in header to start.`);
}

/**
 * Handles incoming settings update events
 * Used by Slideshow Management User Story 1 for real-time updates
 */
function handleSocketSettingsUpdate(data) {
    console.log('Socket received settingsUpdate:', data);
    if (data && data.transitionTime !== undefined && data.order !== undefined && data.showTextOverlay !== undefined) {
        updateState('slideshow', { 
             transitionTime: data.transitionTime,
             order: data.order,
             showTextOverlay: data.showTextOverlay
         });
        loadSettingsValues();
    }
}

/**
 * Attaches event listeners for settings controls
 * Implements Slideshow Management Stories 1-4:
 * - Order buttons
 * - Save button
 * - Play tags button
 * - Settings update handling
 */
export function attachSettingsEventListeners() {
    // Order Buttons
    if (dom.orderRandomBtn) dom.orderRandomBtn.addEventListener('click', handleOrderButtonClick);
    if (dom.orderAlphaBtn) dom.orderAlphaBtn.addEventListener('click', handleOrderButtonClick);
    if (dom.orderGroupsBtn) dom.orderGroupsBtn.addEventListener('click', handleOrderButtonClick);

    // Save Button
    if (dom.saveSettingsBtn) dom.saveSettingsBtn.addEventListener('click', handleSaveSettings);

     // Play Tags Button
    if (dom.playTagsBtn) dom.playTagsBtn.addEventListener('click', handlePlayTagsClick);

    // Playlist play buttons are now handled by playlistManager.js
}

/**
 * Initializes the settings tab
 * Sets up all settings functionality based on user stories
 */
export function initSettingsTab() {
    console.log('Initializing Settings Tab...');

    loadSettingsValues();
    // REMOVE Initial call: displayTagsForSelection(); // Let refreshManageData handle population
    // displayPlaylistsForSelection is now handled by playlistManager.js
    attachSettingsEventListeners();

    // Add Socket Listener for remote changes
    if (socket) {
        socket.off('settingsUpdate', handleSocketSettingsUpdate); // Remove previous listener if re-initializing
        socket.on('settingsUpdate', handleSocketSettingsUpdate);
        console.log('Settings tab listening for "settingsUpdate" socket events.');
    } else {
        console.warn('Socket not available for settings tab.');
    }
} 