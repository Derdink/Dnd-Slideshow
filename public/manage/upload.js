/**
 * upload.js
 * Implements image upload functionality based on user stories:
 * - Image Management User Story 1: Upload images with thumbnails and database integration
 * - Performance and Optimization User Story 1: Quick loading with thumbnails
 * - Performance and Optimization User Story 4: Lazy loading for images
 */

// public/manage/upload.js
// Logic for the Upload tab and file handling

import { uploadFile } from '../api.js';
import { refreshManageData } from '../manage.js'; // To refresh image list after upload
import { DEFAULTS, UI } from '../config.js';

// DOM elements cached by parent manage.js module
let dom = {};

export function setUploadDOMCache(cachedDom) {
    dom = cachedDom;
}

/**
 * Handles files selected via drag-drop or file input
 * Implements Image Management User Story 1:
 * - Select and upload multiple images
 * - Drag and drop support
 * - Store images on server
 * - Generate thumbnails
 * - Add to database with date
 * - Set title from filename
 * - Handle invalid characters in title
 */
function handleFiles(files) {
    if (!files || files.length === 0) {
        return;
    }
    if (!dom.uploadStatus) {
        console.warn('Upload status element not cached.');
        return;
    }

    dom.uploadStatus.innerHTML = ''; // Clear previous statuses
    dom.uploadStatus.style.display = 'block'; // Make sure status area is visible

    // Process each file individually
    Array.from(files).forEach(file => {
        // Basic client-side type check (server validates too)
        if (!file.type.startsWith('image/')) {
            updateUploadStatus(file.name, 'Error: Only image files are allowed.', true);
            return;
        }
        // Client-side size check
        if (file.size > DEFAULTS.MAX_FILE_SIZE) {
            updateUploadStatus(file.name, `Error: File exceeds ${DEFAULTS.MAX_FILE_SIZE / (1024 * 1024)}MB limit.`, true);
            return;
        }

        // Start the upload process for this file
        uploadSingleFile(file);
    });
}

/**
 * Uploads a single file with overwrite handling and title validation
 * Used by Image Management User Story 1 for file processing:
 * - Validate title characters
 * - Show modal for invalid characters
 * - Handle file upload with validated title
 */
async function uploadSingleFile(file, overwrite = false) {
    const fileName = file.name;
    const titleWithoutExt = fileName.replace(/\.[^/.]+$/, '');
    const invalidChars = findInvalidChars(titleWithoutExt);

    if (invalidChars.length > 0) {
        showTitleValidationModal(file, invalidChars);
        return;
    }

    updateUploadStatus(fileName, `Uploading${overwrite ? ' (overwriting)' : ''}...`);

    try {
        const response = await uploadFile(file, overwrite);

        if (response.overwritePrompt) {
            updateUploadStatus(fileName, 'File exists. Overwrite? ', false, true, file);
        } else {
            updateUploadStatus(fileName, response.message || 'Upload successful!', false, false, null, true);
            await refreshManageData();
        }
    } catch (error) {
        console.error(`Error uploading ${fileName}:`, error);
        updateUploadStatus(fileName, `Error: ${error.message || 'Upload failed.'}`, true, false, null, false);
    }
}

/**
 * Updates the upload status display
 * Provides feedback for Image Management User Story 1 operations
 */
function updateUploadStatus(filename, message, isError = false, showOverwriteBtn = false, fileToOverwrite = null, autoClear = false) {
    if (!dom.uploadStatus) return;

    // Make the container visible if it's currently hidden
    if (dom.uploadStatus.style.display === 'none') {
        dom.uploadStatus.style.display = 'block'; // Or 'flex' if it uses flexbox
    }

    // Find existing status line for this file or create a new one
    let statusLine = dom.uploadStatus.querySelector(`[data-filename="${filename}"]`);
    if (!statusLine) {
        statusLine = document.createElement('div');
        statusLine.setAttribute('data-filename', filename);
        dom.uploadStatus.appendChild(statusLine);
    }

    // Create a span for the message to allow appending buttons without replacing text
    const messageSpan = document.createElement('span');
    messageSpan.textContent = `${filename}: ${message}`;
    
    // Clear previous content and add the message span
    statusLine.innerHTML = ''; 
    statusLine.appendChild(messageSpan);
    
    statusLine.style.color = isError ? 'var(--cds-support-error, #da1e28)' : 'var(--cds-text-primary, #161616)';
    statusLine.style.opacity = '1';
    statusLine.style.transition = `opacity ${UI.FADE_DURATION / 1000}s ease-out`;

    // Add Overwrite and Cancel buttons if needed
    if (showOverwriteBtn && fileToOverwrite) {
        const buttonContainer = document.createElement('div'); // Use a container for buttons
        buttonContainer.style.display = 'inline-block'; // Keep buttons on the same line
        buttonContainer.style.marginLeft = '10px';

        // Overwrite Button
        const overwriteBtn = document.createElement('button');
        overwriteBtn.textContent = 'Yes, Overwrite';
        overwriteBtn.classList.add('bx--btn', 'bx--btn--danger--tertiary', 'bx--btn--sm');
        overwriteBtn.onclick = () => {
            messageSpan.textContent = `${filename}: Overwriting...`; // Update message
            buttonContainer.remove(); // Remove button container
            uploadSingleFile(fileToOverwrite, true);
        };
        buttonContainer.appendChild(overwriteBtn);

        // Cancel Button
        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Cancel';
        cancelBtn.classList.add('bx--btn', 'bx--btn--secondary', 'bx--btn--sm');
        cancelBtn.style.marginLeft = '5px'; // Add some space between buttons
        cancelBtn.onclick = () => {
            messageSpan.textContent = `${filename}: Upload cancelled.`; // Update message
            buttonContainer.remove(); // Remove button container
            // Optionally auto-clear the cancelled message after a delay
            setTimeout(() => {
                statusLine.style.opacity = '0';
                setTimeout(() => statusLine.remove(), UI.FADE_DURATION);
            }, UI.SAVE_MESSAGE_DURATION);
        };
        buttonContainer.appendChild(cancelBtn);
        
        // Append the container with both buttons to the status line
        statusLine.appendChild(buttonContainer);
    }

    // Auto-clear logic for success/error messages (if not showing buttons)
    if (autoClear && !isError && !showOverwriteBtn) {
        setTimeout(() => {
            statusLine.style.opacity = '0';
            // Remove the element after fade-out
            setTimeout(() => {
                statusLine.remove();
                // Optional: Hide the whole container if it's now empty
                if (dom.uploadStatus && !dom.uploadStatus.hasChildNodes()) {
                    dom.uploadStatus.style.display = 'none';
                }
            }, UI.FADE_DURATION);
        }, UI.SAVE_MESSAGE_DURATION); // Use same duration as settings save message
    }
}

/**
 * Attaches event listeners for upload controls
 * Implements Image Management User Story 1:
 * - Drag and drop area
 * - File selection button
 * - File input handling
 */
export function attachUploadEventListeners() {
    if (!dom.dropArea || !dom.selectFilesBtn || !dom.fileInput) {
        console.warn('Upload DOM elements not fully cached. Listeners not attached.');
        return;
    }

    // Prevent default drag behaviors
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dom.dropArea.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
        }, false);
    });

    // Highlight drop zone
    ['dragenter', 'dragover'].forEach(eventName => {
        dom.dropArea.addEventListener(eventName, () => {
            dom.dropArea.classList.add('highlight');
        }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dom.dropArea.addEventListener(eventName, () => {
            dom.dropArea.classList.remove('highlight');
        }, false);
    });

    // Handle dropped files
    dom.dropArea.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const files = dt.files;
        handleFiles(files);
    }, false);

    // Handle file selection via button/input
    dom.selectFilesBtn.addEventListener('click', () => {
        dom.fileInput.click(); // Trigger hidden file input
    });

    dom.fileInput.addEventListener('change', (e) => {
        handleFiles(e.target.files);
        // Reset the input value to allow selecting the same file again
        e.target.value = null;
    });
}

/**
 * Initializes the upload tab
 * Sets up upload functionality based on user stories
 */
export function initUploadTab() {
    console.log('Initializing Upload Tab...');
    attachUploadEventListeners();
}

/**
 * Finds invalid characters in a title string
 * @param {string} title - The title to validate
 * @returns {string[]} Array of invalid characters found
 */
function findInvalidChars(title) {
    const invalidChars = /[<>:"/\\|?*]/g;
    const matches = title.match(invalidChars);
    return matches ? [...new Set(matches)] : [];
}

/**
 * Shows a modal with invalid character information
 * @param {File} file - The file with invalid characters
 * @param {string[]} invalidChars - Array of invalid characters found
 */
function showTitleValidationModal(file, invalidChars) {
    const modalContent = document.createElement('div');
    modalContent.innerHTML = `
        <h3>Invalid Characters in Title</h3>
        <p>The file "${file.name}" contains invalid characters:</p>
        <p class="invalid-chars">${invalidChars.join(' ')}</p>
        <p>Please rename the file without these characters and try again.</p>
        <p>Invalid characters: < > : " / \\ | ? *</p>
    `;

    const modal = document.getElementById('titleValidationModal') || createTitleValidationModal();
    modal.querySelector('.modal-content').innerHTML = '';
    modal.querySelector('.modal-content').appendChild(modalContent);
    modal.style.display = 'block';
}

/**
 * Creates the title validation modal if it doesn't exist
 * @returns {HTMLElement} The modal element
 */
function createTitleValidationModal() {
    const modal = document.createElement('div');
    modal.id = 'titleValidationModal';
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content">
        </div>
        <span class="close">&times;</span>
    `;

    modal.querySelector('.close').onclick = () => modal.style.display = 'none';
    window.onclick = (event) => {
        if (event.target === modal) {
            modal.style.display = 'none';
        }
    };

    document.body.appendChild(modal);
    return modal;
} 