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

    const { currentPage, totalPages, totalItems, itemsPerPage } = paginationData;

    if (totalPages <= 1 && totalItems <= itemsPerPage) return; // Don't show controls if only one page or fewer items than limit

    const createButton = (label, title, svgPath, onClick, disabled = false) => {
        const btn = document.createElement('button');
        btn.classList.add('bx--btn', 'bx--btn--ghost', 'bx--btn--icon-only', 'bx--pagination__button');
        btn.title = title;
        btn.disabled = disabled;
        btn.innerHTML = svgPath + `<span class="bx--assistive-text">${label}</span>`;
        btn.addEventListener('click', onClick);
        return btn;
    };

    // SVGs remain the same
    const svgFirst = '<svg focusable="false" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" fill="currentColor" width="16" height="16" viewBox="0 0 32 32" aria-hidden="true"><path d="M19 24H21V8H19zM11 24L13 24 13 8 11 8z"></path></svg>';
    const svgPrev = '<svg focusable="false" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" fill="currentColor" width="16" height="16" viewBox="0 0 32 32" aria-hidden="true"><path d="M18 24l-8-8 8-8 1.4 1.4L12.8 16l6.6 6.6z"></path></svg>';
    const svgNext = '<svg focusable="false" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" fill="currentColor" width="16" height="16" viewBox="0 0 32 32" aria-hidden="true"><path d="M14 24l1.4-1.4L8.8 16l6.6-6.6L14 8l-8 8z"></path></svg>';
    const svgLast = '<svg focusable="false" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" fill="currentColor" width="16" height="16" viewBox="0 0 32 32" aria-hidden="true"><path d="M11 24H13V8H11zM19 8v16h2V8z"></path></svg>';


    const firstBtn = createButton('First', 'First Page', svgFirst, () => goToPage(1), currentPage === 1);
    const prevBtn = createButton('Previous', 'Previous Page', svgPrev, () => goToPage(currentPage - 1), currentPage === 1);
    const nextBtn = createButton('Next', 'Next Page', svgNext, () => goToPage(currentPage + 1), currentPage === totalPages);
    const lastBtn = createButton('Last', 'Last Page', svgLast, () => goToPage(totalPages), currentPage === totalPages);

    // Page Select Dropdown
    const pageSelectContainer = document.createElement('div');
    pageSelectContainer.classList.add('bx--select', 'bx--select--inline', 'bx--select--sm', 'bx--pagination__select'); // Added pagination class
    pageSelectContainer.innerHTML = `
        <label class="bx--label bx--visually-hidden" for="page-select">Current page number</label>
        <select class="bx--select-input" id="page-select" title="Go to page"></select>
        <svg focusable="false" preserveAspectRatio="xMidYMid meet" style="will-change: transform;" xmlns="http://www.w3.org/2000/svg" class="bx--select__arrow" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 11L3 6 3.7 5.3 8 9.6 12.3 5.3 13 6z"></path></svg>
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

    // Page Info Span
    const pageInfo = document.createElement('span');
    pageInfo.classList.add('bx--pagination__text');
    const startEntry = totalItems === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1;
    const endEntry = Math.min(currentPage * itemsPerPage, totalItems);
    pageInfo.textContent = totalPages > 1 ? `Page ${currentPage} of ${totalPages}` : ''; // Hide page x of y if only 1 page
    const itemRangeInfo = document.createElement('span');
    itemRangeInfo.classList.add('bx--pagination__text');
    itemRangeInfo.textContent = ` | ${startEntry}–${endEntry} of ${totalItems} items`;


    // Limit Select Dropdown
    const limitSelectContainer = document.createElement('div');
    limitSelectContainer.classList.add('bx--select', 'bx--select--inline', 'bx--select--sm', 'bx--pagination__select'); // Added pagination class
    limitSelectContainer.innerHTML = `
        <label class="bx--label" for="limit-select">Items per page:</label>
        <select class="bx--select-input" id="limit-select" title="Images per page"></select>
        <svg focusable="false" preserveAspectRatio="xMidYMid meet" style="will-change: transform;" xmlns="http://www.w3.org/2000/svg" class="bx--select__arrow" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 11L3 6 3.7 5.3 8 9.6 12.3 5.3 13 6z"></path></svg>
    `;
    const limitSelect = limitSelectContainer.querySelector('#limit-select');
    [20, 50, 100, 200].forEach(limit => {
        const opt = document.createElement('option');
        opt.value = limit;
        opt.textContent = limit;
        if (limit === itemsPerPage) opt.selected = true; // Use itemsPerPage from server
        limitSelect.appendChild(opt);
    });
    limitSelect.addEventListener('change', (e) => {
        updateState('management', { currentLimit: parseInt(e.target.value), currentPage: 1 }); // Reset to page 1
        refreshManageData(); // Fetch data with new limit
    });

    // Assemble Pagination Controls
    const controlsLeft = document.createElement('div');
    controlsLeft.classList.add('bx--pagination__left');
    controlsLeft.appendChild(limitSelectContainer);
    controlsLeft.appendChild(itemRangeInfo); // Show item range here

    const controlsRight = document.createElement('div');
    controlsRight.classList.add('bx--pagination__right');
    controlsRight.appendChild(pageInfo); // Show 'Page x of y' here
    controlsRight.appendChild(pageSelectContainer);
    if (totalPages > 1) { // Only show nav buttons if multiple pages
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