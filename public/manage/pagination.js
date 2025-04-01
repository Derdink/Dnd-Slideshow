// public/manage/pagination.js
// Logic for rendering and handling pagination controls

import { state, updateState } from '../state.js';
import { refreshManageData } from '../manage.js'; // Need main refresh function

// DOM elements cached by parent manage.js module
let dom = {};

export function setPaginationDOMCache(cachedDom) {
    dom = cachedDom;
}

/**
 * Updates pagination controls based on data from the server.
 * @param {object} paginationData - The pagination object from the API ({ currentPage, totalPages, totalItems, itemsPerPage })
 */
export function updatePaginationControls(paginationData) {
    if (!dom.paginationContainer || !paginationData) return;
    dom.paginationContainer.innerHTML = ''; // Clear existing controls
    // ADD Carbon class to the main container
    dom.paginationContainer.className = 'bx--pagination';

    const { currentPage, totalPages, totalItems, itemsPerPage } = paginationData;

    if (totalPages <= 1 && totalItems <= itemsPerPage) {
        dom.paginationContainer.style.display = 'none'; // Hide container if no pagination needed
        return;
    } else {
        dom.paginationContainer.style.display = ''; // Ensure it's visible otherwise
    }

    const createButton = (label, title, svgPath, onClick, disabled = false) => {
        const btn = document.createElement('button');
        // Use correct Carbon button classes for pagination
        btn.className = `bx--btn bx--btn--ghost bx--btn--icon-only bx--pagination__button bx--pagination__button--${label.toLowerCase()}`;
        btn.title = title;
        btn.disabled = disabled;
        btn.innerHTML = svgPath;
        // Add aria-label for accessibility
        btn.setAttribute('aria-label', label);
        btn.addEventListener('click', onClick);
        return btn;
    };

    // Updated Carbon v11 SVGs
    const svgPrev = '<svg focusable="false" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" fill="currentColor" aria-label="Previous page" width="16" height="16" viewBox="0 0 16 16" role="img"><path d="M10 11.8L5.2 7.9 10 4 10.7 4.7 6.7 7.9 10.7 11.1z"></path></svg>';
    const svgNext = '<svg focusable="false" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" fill="currentColor" aria-label="Next page" width="16" height="16" viewBox="0 0 16 16" role="img"><path d="M6 4.7L10.8 7.9 6 11.1 5.3 10.4 9.3 7.9 5.3 5.4z"></path></svg>';
    // RE-ADDED: Use Prev/Next SVGs for First/Last for simplicity
    const svgFirst = svgPrev; 
    const svgLast = svgNext;

    // Buttons - Re-enabled First/Last
    const firstBtn = createButton('First', 'First Page', svgFirst, () => goToPage(1), currentPage === 1);
    const prevBtn = createButton('Previous', 'Previous Page', svgPrev, () => goToPage(currentPage - 1), currentPage === 1);
    const nextBtn = createButton('Next', 'Next Page', svgNext, () => goToPage(currentPage + 1), currentPage === totalPages);
    const lastBtn = createButton('Last', 'Last Page', svgLast, () => goToPage(totalPages), currentPage === totalPages);

    // Items per page Select (Left side)
    const limitSelectContainer = document.createElement('div');
    limitSelectContainer.classList.add('bx--select', 'bx--select--inline', 'bx--pagination__select'); // Removed size class, inherited
    limitSelectContainer.innerHTML = `
        <label class="bx--label" for="limit-select">Items per page:</label>
        <select class="bx--select-input" id="limit-select" title="Items per page"></select>
        <svg focusable="false" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" fill="currentColor" class="bx--select__arrow" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 11L3 6 3.7 5.3 8 9.6 12.3 5.3 13 6z"></path></svg>
    `;
    const limitSelect = limitSelectContainer.querySelector('#limit-select');
    [20, 50, 100, 200].forEach(limit => {
        const opt = document.createElement('option');
        opt.value = limit;
        opt.textContent = limit;
        if (limit === itemsPerPage) opt.selected = true;
        limitSelect.appendChild(opt);
    });
    limitSelect.addEventListener('change', (e) => {
        updateState('management', { currentLimit: parseInt(e.target.value), currentPage: 1 });
        refreshManageData();
    });

    // Item Range Info (Left side)
    const itemRangeInfo = document.createElement('span');
    itemRangeInfo.classList.add('bx--pagination__text');
    const startEntry = totalItems === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1;
    const endEntry = Math.min(currentPage * itemsPerPage, totalItems);
    itemRangeInfo.textContent = `${startEntry}–${endEntry} of ${totalItems} items`; // Use en dash

    // Page Select (Right side)
    const pageSelectContainer = document.createElement('div');
    pageSelectContainer.classList.add('bx--select', 'bx--select--inline', 'bx--pagination__select');
    pageSelectContainer.innerHTML = `
        <label class="bx--label" for="page-select">Page number:</label>
        <select class="bx--select-input" id="page-select" title="Page number"></select>
        <svg focusable="false" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" fill="currentColor" class="bx--select__arrow" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 11L3 6 3.7 5.3 8 9.6 12.3 5.3 13 6z"></path></svg>
    `;
    const pageSelect = pageSelectContainer.querySelector('#page-select');
    for (let i = 1; i <= totalPages; i++) {
        const opt = document.createElement('option');
        opt.value = i;
        opt.textContent = i;
        if (i === currentPage) opt.selected = true;
        pageSelect.appendChild(opt);
    }
    pageSelect.addEventListener('change', (e) => goToPage(parseInt(e.target.value)));

    // Page Info Span (Right side)
    const pageInfo = document.createElement('span');
    pageInfo.classList.add('bx--pagination__text');
    pageInfo.textContent = `of ${totalPages} pages`; // Carbon format

    // Assemble Pagination Controls
    const controlsLeft = document.createElement('div');
    controlsLeft.classList.add('bx--pagination__left');
    controlsLeft.appendChild(limitSelectContainer);
    controlsLeft.appendChild(itemRangeInfo); 

    const controlsRight = document.createElement('div');
    controlsRight.classList.add('bx--pagination__right');
    controlsRight.appendChild(pageSelectContainer);
    controlsRight.appendChild(pageInfo); 
    if (totalPages > 1) { // Only show nav buttons if multiple pages
        // RE-ADD First/Last buttons
        controlsRight.appendChild(firstBtn);
        controlsRight.appendChild(prevBtn);
        controlsRight.appendChild(nextBtn);
        controlsRight.appendChild(lastBtn); 
    }

    dom.paginationContainer.appendChild(controlsLeft);
    dom.paginationContainer.appendChild(controlsRight);
}

/**
 * Navigates to a specific page by updating state and refreshing data.
 */
function goToPage(page) {
    // Get totalPages from the latest pagination data stored in state
    const totalPages = state.management.totalPages || 1;
    if (page >= 1 && page <= totalPages && page !== state.management.currentPage) {
        updateState('management', { currentPage: page });
        refreshManageData(); // Fetch data for the new page
    }
} 