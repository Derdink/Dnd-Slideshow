// server-2.js
// Refactored server code based on prompts 1-3 and refinement pass

// =============================================================================
// Imports & Setup
// =============================================================================
const express = require('express');
const path = require('path');
const fs = require('fs').promises; // Use promises for async operations
const multer = require('multer');
const sqlite3 = require('sqlite3').verbose();
const sharp = require('sharp');
const http = require('http'); // Required for Socket.IO
const { Server } = require("socket.io"); // Correct Socket.IO import
const cors = require('cors'); // Added import for CORS

const app = express();
const server = http.createServer(app); // Create HTTP server for Socket.IO
const io = new Server(server, { // Initialize Socket.IO with the HTTP server
    cors: {
        origin: ["http://localhost:3000", "http://127.0.0.1:3000"], // Adjust as needed
        methods: ["GET", "POST"],
        credentials: true
    },
    // Add other Socket.IO options as needed
    pingTimeout: 60000,
    pingInterval: 25000,
});

const PORT = process.env.PORT || 3000; // Use environment variable or default
const PUBLIC_DIR = path.join(__dirname, 'public');
const UPLOAD_DIR = path.join(PUBLIC_DIR, 'images');
const THUMBNAIL_DIR = path.join(PUBLIC_DIR, 'thumbnails');
const DB_FILE = path.join(__dirname, 'images.db'); // Ensure this uses the correct DB file
const DEFAULT_COLOR = '#cccccc'; // Default color for tags/playlists
const HIDDEN_TAG_NAME = 'Hidden';
const HIDDEN_TAG_COLOR = '#666666';

// =============================================================================
// Logging Middleware
// =============================================================================
/**
 * Basic request logger middleware.
 * Logs method, URL, and status code for each incoming request.
 */
app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms`);
    });
    next();
});


// =============================================================================
// Middleware Configuration
// =============================================================================
// Disable caching
app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    next();
});

// Serve static files with explicit CSS Content-Type
app.use(express.static(PUBLIC_DIR, {
  setHeaders: function (res, path, stat) {
    if (path.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css');
    }
  }
}));

// Parse JSON bodies with increased limit
app.use(express.json({ limit: '50mb' }));

// Parse URL-encoded bodies with increased limit
app.use(express.urlencoded({ limit: '50mb', extended: true }));


// =============================================================================
// Database Setup & Initialization
// =============================================================================
let db; // Declare db variable

/**
 * Connects to the SQLite database.
 * @returns {Promise<sqlite3.Database>} A promise that resolves with the database connection.
 */
async function connectDatabase() {
    return new Promise((resolve, reject) => {
        const connection = new sqlite3.Database(DB_FILE, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
            if (err) {
                console.error('❌ Database connection error:', err.message);
                reject(err);
            } else {
                console.log('✅ Database connected successfully.');
                db = connection; // Assign to global db variable
                resolve(db);
            }
        });
    });
}

/**
 * Initializes the database schema. Creates tables if they don't exist and ensures the Hidden tag exists.
 * @param {sqlite3.Database} databaseConnection - The active SQLite database connection.
 * @returns {Promise<void>}
 */
async function initializeSchema(databaseConnection) {
    console.log('🔧 Initializing database schema...');
    return new Promise((resolve, reject) => {
        databaseConnection.serialize(async() => {
            try {
                // Promisify db.run and db.get for use within this async function
                const run = (sql, params = []) => new Promise((res, rej) => {
                    databaseConnection.run(sql, params, function(err) { // Use function() for this.lastID/changes
                        if (err) {
                            console.error(`❌ Error executing SQL RUN: ${sql}`, err.message);
                            return rej(err);
                        }
                        res({ lastID: this.lastID, changes: this.changes });
                    });
                });
                const get = (sql, params = []) => new Promise((res, rej) => {
                    databaseConnection.get(sql, params, (err, row) => {
                        if (err) {
                            console.error(`❌ Error executing SQL GET: ${sql}`, err.message);
                            return rej(err);
                        }
                        res(row || null);
                    });
                });

                // Create images table (Removed tags TEXT column)
                await run(`
                    CREATE TABLE IF NOT EXISTS images (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        filename TEXT UNIQUE NOT NULL,
                        title TEXT NOT NULL,
        description TEXT,  
                        dateAdded TEXT NOT NULL
                    )
                `);
                console.log('  - `images` table checked/created.');

                // Check if description column exists
                const columns = await dbAll(`PRAGMA table_info(images)`);
                const descriptionExists = columns.some(col => col.name === 'description');

                if (!descriptionExists) {
                    try {
                        await run('ALTER TABLE images ADD COLUMN description TEXT');
                        console.log("  - Column 'description' added to `images` table.");
                    } catch (err) {
                        // Handle potential errors during ALTER TABLE, though less likely now
                        console.error('❌ Error adding description column:', err.message);
                        throw err;
                    }
                } else {
                    console.log("  - Column 'description' already exists in `images` table.");
                }

                // Create tags table
                await run(`
                    CREATE TABLE IF NOT EXISTS tags (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        name TEXT UNIQUE NOT NULL,
                        color TEXT
                    )
                `);
                console.log('  - `tags` table checked/created.');

                // Ensure 'Hidden' tag exists
                const hiddenTag = await get('SELECT id FROM tags WHERE name = ?', [HIDDEN_TAG_NAME]);
                if (!hiddenTag) {
                    await run('INSERT INTO tags (name, color) VALUES (?, ?)', [HIDDEN_TAG_NAME, HIDDEN_TAG_COLOR]);
                    console.log(`  - Created protected '${HIDDEN_TAG_NAME}' tag.`);
                } else {
                    console.log(`  - Protected '${HIDDEN_TAG_NAME}' tag already exists.`);
                }

                // Create image_tags table
                await run(`
                    CREATE TABLE IF NOT EXISTS image_tags (
                        image_id INTEGER NOT NULL,
                        tag_id INTEGER NOT NULL,
                        PRIMARY KEY (image_id, tag_id),
                        FOREIGN KEY (image_id) REFERENCES images(id) ON DELETE CASCADE,
                        FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
                    )
                `);
                console.log('  - `image_tags` table checked/created.');

                // Create playlists table
                await run(`
                    CREATE TABLE IF NOT EXISTS playlists (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        name TEXT UNIQUE NOT NULL,
                        color TEXT,
                        is_hidden INTEGER DEFAULT 0 NOT NULL, -- Added NOT NULL
                        created_at TEXT NOT NULL
                    )
                `);
                console.log('  - `playlists` table checked/created.');

                // Create playlist_images table
                await run(`
                    CREATE TABLE IF NOT EXISTS playlist_images (
                        playlist_id INTEGER NOT NULL,
                        image_id INTEGER NOT NULL,
                        PRIMARY KEY (playlist_id, image_id),
                        FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
                        FOREIGN KEY (image_id) REFERENCES images(id) ON DELETE CASCADE
                    )
                `);
                console.log('  - `playlist_images` table checked/created.');

                console.log('✅ Schema initialization complete.');
                resolve();
            } catch (err) {
                console.error('❌ Error during schema initialization:', err.message);
                reject(err);
        }
    });
});
}


// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Creates directories if they don't exist.
 * @param {string[]} dirs - An array of directory paths to ensure exist.
 * @returns {Promise<void>}
 */
async function ensureDirectoriesExist(dirs) {
    console.log('📁 Ensuring required directories exist...');
    for (const dir of dirs) {
        try {
            await fs.mkdir(dir, { recursive: true });
            console.log(`  - Directory ensured: ${dir}`);
        } catch (err) {
            console.error(`❌ Error creating directory ${dir}:`, err);
            throw err; // Stop execution if we can't create essential directories
        }
    }
    console.log('✅ Directories checked/created.');
}

/**
 * Promisified version of db.get.
 * @param {string} sql - The SQL query to execute.
 * @param {any[]} [params=[]] - Parameters for the SQL query.
 * @returns {Promise<object|null>} Promise resolving with the row or null if not found.
 */
const dbGet = (sql, params = []) => new Promise((resolve, reject) => {
    if (!db) return reject(new Error("Database not connected"));
    db.get(sql, params, (err, row) => {
        if (err) {
            console.error(`❌ DB GET Error: ${sql}`, params, err.message);
            reject(new Error('Database query failed'));
        } else {
            resolve(row || null); // Ensure null is returned if no row found
        }
    });
});

/**
 * Promisified version of db.all.
 * @param {string} sql - The SQL query to execute.
 * @param {any[]} [params=[]] - Parameters for the SQL query.
 * @returns {Promise<object[]>} Promise resolving with an array of rows.
 */
const dbAll = (sql, params = []) => new Promise((resolve, reject) => {
    if (!db) return reject(new Error("Database not connected"));
    db.all(sql, params, (err, rows) => {
        if (err) {
            console.error(`❌ DB ALL Error: ${sql}`, params, err.message);
            reject(new Error('Database query failed'));
        } else {
            resolve(rows || []); // Ensure empty array if no rows
        }
    });
});

/**
 * Promisified version of db.run.
 * Handles INSERT, UPDATE, DELETE operations.
 * @param {string} sql - The SQL query to execute.
 * @param {any[]} [params=[]] - Parameters for the SQL query.
 * @returns {Promise<{lastID: number, changes: number}>} Promise resolving with lastID and changes count.
 */
const dbRun = (sql, params = []) => new Promise((resolve, reject) => {
    if (!db) return reject(new Error("Database not connected"));
    db.run(sql, params, function(err) { // Must use function() to access this.lastID/changes
        if (err) {
            console.error(`❌ DB RUN Error: ${sql}`, params, err.message);
            reject(new Error('Database operation failed'));
        } else {
            resolve({ lastID: this.lastID, changes: this.changes });
        }
    });
});

/**
 * Sanitizes a filename to remove or replace potentially problematic characters.
 * Includes handling for Unicode normalization and specific character replacements.
 * @param {string} name - The original filename.
 * @returns {string} The sanitized filename.
 */
function sanitizeFilename(name) {
    if (!name) return '';
    // Normalize Unicode characters (e.g., convert accented chars to base char + combining accent)
    // and remove the combining diacritical marks.
    let normalized = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    // Define replacements for problematic characters
    const replacements = {
        "'": "\u2019", // Replace standard apostrophe with right single quotation mark
        "':": "\u2019", // Keep right single quotation mark
        "\"": "\u201D", // Replace standard double quote with right double quotation mark
        "": "\u201C", // Keep left double quotation mark
        "": "\u201D", // Keep right double quotation mark
        "\\": "-", // Replace backslash with hyphen
        "/": "-", // Replace forward slash with hyphen
        ":": "-", // Replace colon with hyphen
        "*": "-", // Replace asterisk with hyphen
        "?": "", // Remove question mark
        "<": "", // Remove less-than sign
        ">": "", // Remove greater-than sign
        "|": "", // Remove pipe character
        "#": "-", // Replace hash with hyphen
        "%": "-", // Replace percent with hyphen
        "&": "and", // Replace ampersand with "and"
        // Ligatures
        "ff": "ff",
        "fi": "fi",
        "fl": "fl",
        "ffi": "ffi",
        "ffl": "ffl",
        // Archaic letters / special characters
        "ae": "ae",
        "oe": "oe",
        "ss": "ss",
        "d": "d",
        "th": "th",
        "s": "s"
    };

    // Remove leading/trailing whitespace and replace sequences of whitespace with a single hyphen
    let result = normalized.trim().replace(/\s+/g, '-');

    // Apply character replacements
    let finalResult = "";
    for (const char of result) {
        // Check if character needs replacement, otherwise keep it if it's alphanumeric, hyphen, or period
        if (char in replacements) {
            finalResult += replacements[char];
        } else if (char.match(/[a-zA-Z0-9\-\.]/)) {
            finalResult += char;
        }
        // Characters not matched are effectively removed
    }

    // Replace multiple consecutive hyphens with a single hyphen
    finalResult = finalResult.replace(/-+/g, '-');

    // Ensure filename doesn't start or end with a hyphen or period
    finalResult = finalResult.replace(/^[-\.]+|[-\.]+$/g, '');

    // Prevent overly long filenames (adjust limit as needed)
    const MAX_FILENAME_LENGTH = 200;
    if (finalResult.length > MAX_FILENAME_LENGTH) {
        const ext = path.extname(finalResult);
        const base = path.basename(finalResult, ext);
        // Ensure base name has at least 1 character after truncation
        const truncatedBase = base.substring(0, MAX_FILENAME_LENGTH - ext.length) || 'image';
        finalResult = truncatedBase + ext;
    }

    // Handle empty filenames after sanitization
    if (!finalResult || finalResult === '.' || finalResult === path.extname(finalResult)) {
        finalResult = `untitled-${Date.now()}${path.extname(name || '') || '.bin'}`; // Provide a default name and extension
    }

    console.log(`Sanitized filename: '${name}' -> '${finalResult}'`);
    return finalResult;
}


// =============================================================================
// Multer Configuration (File Uploads)
// =============================================================================
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, UPLOAD_DIR); // Use constant
    },
    filename: (req, file, cb) => {
        const safeName = sanitizeFilename(file.originalname);
        cb(null, safeName);
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 50 * 1024 * 1024 // 50MB limit
    },
    fileFilter: (req, file, cb) => {
        // Basic image type filtering (can be expanded)
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            console.warn(`⚠️ Upload rejected: Invalid file type - ${file.mimetype} for ${file.originalname}`);
            cb(new Error('Invalid file type. Only images are allowed.'), false);
        }
    }
});


// =============================================================================
// Helper Function - Thumbnail Generation
// =============================================================================
/**
 * Generates a thumbnail for an image file.
 * @param {string} originalPath - Path to the original uploaded image.
 * @param {string} thumbPath - Path where the thumbnail should be saved.
 * @param {string} filename - The filename (for logging).
 * @returns {Promise<void>}
 */
async function generateThumbnail(originalPath, thumbPath, filename) {
    console.log(`  ⏳ Generating thumbnail for: ${filename}`);
    try {
        await sharp(originalPath)
            .resize({ width: 200 }) // Keep width constraint
            .toFile(thumbPath);
        console.log(`    ✅ Thumbnail created successfully: ${thumbPath}`);
    } catch (err) {
        console.error(`    ❌ Error generating thumbnail for ${filename}:`, err);
        // Log the error but allow the upload process to continue.
    }
}

// =============================================================================
// Upload Route (/upload)
// =============================================================================
/**
 * @route   POST /upload
 * @desc    Handle single file uploads, add entry to database, generate thumbnail.
 * @access  Public
 * @middleware Multer (upload.single('file'))
 */
app.post('/upload', upload.single('file'), async(req, res, next) => {
    // Check if a multer error occurred (passed via res.locals by the error handler)
    if (res.locals.multerError) {
        const err = res.locals.multerError;
        console.warn(`⚠️ POST /upload - Multer error: ${err.message}`);
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(413).json({ message: 'File too large. Limit is 50MB.' });
        }
        if (err.message === 'Invalid file type. Only images are allowed.') {
            return res.status(415).json({ message: err.message });
        }
        // Other multer errors
        return res.status(400).json({ message: `File upload error: ${err.message}` });
    }

    // Check if the file object exists after multer middleware
    if (!req.file) {
        console.warn("⚠️ POST /upload - No file object found after multer processing.");
        return res.status(400).json({ message: 'No file uploaded or file rejected.' });
    }

    const overwrite = req.body.overwrite === 'true';
    const sanitizedFilename = req.file.filename;
    const originalPath = req.file.path;
    const thumbPath = path.join(THUMBNAIL_DIR, sanitizedFilename);
    const originalName = req.file.originalname;
    const title = path.basename(originalName, path.extname(originalName));
    const dateAdded = Date.now().toString();

    console.log(`➡️ POST /upload request received for file: ${originalName} (Sanitized: ${sanitizedFilename})`, { overwrite });

    try {
        // *** NEW: Check for duplicate based on ORIGINAL filename first ***
        const existingByOriginal = await dbGet('SELECT id, filename FROM images WHERE title = ? AND filename != ?', 
            [title, sanitizedFilename] // Check if title exists with a DIFFERENT sanitized name
        );
        // If an entry exists with the same title but different sanitized name, and we are NOT overwriting,
        // it implies a logical duplicate (e.g., "My Pic.jpg" vs "My_Pic.jpg") that we might want to prevent.
        // NOTE: This logic assumes `title` is reliably derived from `originalName`'s base.
        if (existingByOriginal && !overwrite) {
            console.log(`  - Logical duplicate detected: Title "${title}" already exists (ID: ${existingByOriginal.id}, Filename: ${existingByOriginal.filename}). Overwrite not requested.`);
            // Clean up the newly uploaded file
            try { await fs.unlink(originalPath); } catch (e) { /* ignore */ }
            // Send a specific error message
            return res.status(409).json({ message: `An image with a similar name ('${title}') already exists. Upload rejected to prevent potential duplicate.` });
        }
        // *** END NEW Check ***

        // Check if an entry with the exact sanitized filename already exists
        const existingBySanitized = await dbGet('SELECT id FROM images WHERE filename = ?', [sanitizedFilename]);

        if (existingBySanitized && !overwrite) {
             // Existing logic for exact filename match, prompt user
            console.log(`  - File "${sanitizedFilename}" exists, overwrite not requested. Prompting client.`);
            try { await fs.unlink(originalPath); } catch (unlinkErr) { /* ... */ }
            return res.json({ overwritePrompt: true, message: `File '${sanitizedFilename}' already exists.` });
        }

        // Proceed with insert or update
        if (existingBySanitized && overwrite) {
            // --- Overwrite existing entry ---
            console.log(`  - File "${sanitizedFilename}" exists, overwriting.`);
            const result = await dbRun(
                'UPDATE images SET title = ?, dateAdded = ?, description = NULL' + 
                ' WHERE filename = ?', 
                [title, dateAdded, sanitizedFilename]
            );
            console.log(`    ✅ Record updated for ID: ${existingBySanitized.id}, Rows affected: ${result.changes}`);

            await generateThumbnail(originalPath, thumbPath, sanitizedFilename);
            console.log(`✅ POST /upload - File "${sanitizedFilename}" overwritten successfully.`);
            res.json({ message: `File '${sanitizedFilename}' overwritten successfully.` });

            } else {
            // --- Insert new entry ---
            console.log(`  - Inserting new record for "${sanitizedFilename}".`);
            const result = await dbRun(
                'INSERT INTO images (filename, title, dateAdded, description) VALUES (?, ?, ?, NULL)',
                [sanitizedFilename, title, dateAdded]
            );
            const newImageId = result.lastID; // Get the ID for tag association
            console.log(`    ✅ New record inserted with ID: ${newImageId}`);

            // Add the new image to the 'Hidden' tag by default
            try {
                const hiddenTag = await dbGet('SELECT id FROM tags WHERE name = ?', [HIDDEN_TAG_NAME]);
                if (hiddenTag) {
                    await dbRun('INSERT OR IGNORE INTO image_tags (image_id, tag_id) VALUES (?, ?)', [newImageId, hiddenTag.id]);
                    console.log(`    - Added new image ${newImageId} to '${HIDDEN_TAG_NAME}' tag (ID: ${hiddenTag.id}).`);
                } else {
                    console.warn(`    ⚠️ Could not add image ${newImageId} to '${HIDDEN_TAG_NAME}' tag: Tag not found.`);
                }
            } catch (tagErr) {
                console.error(`    ❌ Error adding image ${newImageId} to '${HIDDEN_TAG_NAME}' tag:`, tagErr.message);
            }

            // *** NEW: Add the new image to the 'All' tag if it exists ***
            try {
                const allTag = await dbGet('SELECT id FROM tags WHERE LOWER(name) = ?', ['all']); // Find 'All' tag (case-insensitive)
                if (allTag) {
                    await dbRun('INSERT OR IGNORE INTO image_tags (image_id, tag_id) VALUES (?, ?)', [newImageId, allTag.id]);
                    console.log(`    - Added new image ${newImageId} to 'All' tag (ID: ${allTag.id}).`);
                } else {
                    // This is not necessarily a warning, the 'All' tag might not be used.
                    console.log(`    - 'All' tag not found, skipping addition for image ${newImageId}.`);
                }
            } catch (tagErr) {
                console.error(`    ❌ Error adding image ${newImageId} to 'All' tag:`, tagErr.message);
            }
            // *** END NEW ***

            await generateThumbnail(originalPath, thumbPath, sanitizedFilename);
            console.log(`✅ POST /upload - File "${sanitizedFilename}" uploaded successfully.`);
            res.status(201).json({ message: `File '${sanitizedFilename}' uploaded successfully.`, imageId: newImageId });
        }

    } catch (err) {
        console.error(`❌ POST /upload - Error processing file ${sanitizedFilename}:`, err.message);
        // Clean up uploaded file on database error?
        try { await fs.unlink(originalPath); } catch (e) { /* ignore */ }
        next(err); // Pass to central error handler
    }
});

// Multer error handling middleware (attach after multer routes)
app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError || err.message === 'Invalid file type. Only images are allowed.') {
        // Store the error in res.locals for the route handler to check
        res.locals.multerError = err;
        next(); // Proceed to the route handler
    } else {
        next(err); // Pass other errors to the generic error handler
    }
});


// =============================================================================
// API Routes - Images (/api/images)
// =============================================================================
const apiRouter = express.Router(); // Use a dedicated router for API endpoints

/**
 * @route   GET /api/images
 * @desc    Get images with filtering, sorting, pagination, and tag info.
 *          Now includes an 'alwaysIncludeIds' feature.
 * @access  Public
 * @query   search {string} - Filter by title or filename.
 * @query   tags {string} - Comma-separated list of tag names to filter by (AND logic).
 * @query   playlistId {number} - Filter by playlist membership.
 * @query   includeHidden {boolean} - If true, include images tagged as 'Hidden'.
 * @query   ids {string} - Comma-separated list of specific image IDs to fetch.
 * @query   alwaysIncludeIds {string} - Comma-separated list of image IDs to *always* include,
 *          even if they don't match filters (used for keeping selected items visible).
 * @query   sortKey {string} - Field to sort by (id, title, dateAdded). Default: dateAdded.
 * @query   sortDir {string} - Sort direction (asc, desc). Default: desc.
 * @query   page {number} - Page number for pagination. Default: 1.
 * @query   limit {number} - Number of items per page. Default: 100.
 */
apiRouter.get('/images', async(req, res, next) => {
    console.log('➡️ GET /api/images request received with query:', req.query);

    // --- Parameter Parsing & Validation ---
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 100; // Default limit
    const offset = (page - 1) * limit;

    const sortKey = req.query.sortKey || 'dateAdded';
    const sortDir = req.query.sortDir?.toLowerCase() === 'asc' ? 'ASC' : 'DESC'; // Default DESC
    const validSortKeys = { 'id': 'i.id', 'title': 'LOWER(i.title)', 'dateAdded': 'i.dateAdded' }; // <-- Corrected mapping
    const orderBy = validSortKeys[sortKey] || validSortKeys.dateAdded;

    const filters = {};
    if (req.query.search) filters.search = req.query.search;
    if (req.query.tags) filters.tags = req.query.tags.split(',').map(t => t.trim()).filter(t => t);
    // Reverted to single playlist ID
    if (req.query.playlistId) filters.playlistId = parseInt(req.query.playlistId, 10);
    if (req.query.ids) filters.ids = req.query.ids.split(',').map(id => parseInt(id.trim(), 10)).filter(id => !isNaN(id));
    if (req.query.alwaysIncludeIds) filters.alwaysIncludeIds = req.query.alwaysIncludeIds.split(',').map(id => parseInt(id.trim(), 10)).filter(id => !isNaN(id));

    // Default to NOT including hidden unless specified
    const includeHidden = req.query.includeHidden === 'true';

    // --- Start of TRY block ---
    try { 
        // --- Query Building ---
        let whereClauses = [];
        let joinClauses = [];
        let params = [];

        // Add search filter (title or filename)
        if (filters.search) {
            whereClauses.push('(LOWER(i.title) LIKE ? OR LOWER(i.filename) LIKE ?)');
            const searchTerm = `%${filters.search.toLowerCase()}%`;
            params.push(searchTerm, searchTerm);
        }

        // Add specific ID filter
        if (filters.ids && filters.ids.length > 0) {
            whereClauses.push(`i.id IN (${filters.ids.map(() => '?').join(',')})`);
            params.push(...filters.ids);
        }

        // Reverted playlist filter for single ID
        if (filters.playlistId && !isNaN(filters.playlistId)) {
            joinClauses.push('INNER JOIN playlist_images pi ON i.id = pi.image_id');
            whereClauses.push('pi.playlist_id = ?');
            params.push(filters.playlistId);
        }

        // Add tag filters (AND logic for multiple tags)
        if (filters.tags && filters.tags.length > 0) {
            const tagPlaceholders = filters.tags.map(() => '?').join(',');
            // Subquery to find images that have ALL specified tags
                whereClauses.push(`
                i.id IN (
                    SELECT it.image_id
                    FROM image_tags it
                    JOIN tags t ON it.tag_id = t.id
                    WHERE LOWER(t.name) IN (${tagPlaceholders})
                    GROUP BY it.image_id
                    HAVING COUNT(DISTINCT LOWER(t.name)) = ?
                )
            `);
            params.push(...filters.tags.map(t => t.toLowerCase()), filters.tags.length);
        }

        // Handle 'Hidden' tag exclusion (unless includeHidden is true)
        if (!includeHidden) {
            const hiddenTag = await dbGet('SELECT id FROM tags WHERE name = ?', [HIDDEN_TAG_NAME]);
            if (hiddenTag) {
            whereClauses.push(`
                    i.id NOT IN (
                        SELECT image_id FROM image_tags WHERE tag_id = ?
                    )
                `);
                params.push(hiddenTag.id);
            }
        }

        // Combine clauses
        const joinClause = joinClauses.join(' ');
        const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

        // --- Count Query (Based ONLY on standard filters) ---
        const countSql = `SELECT COUNT(DISTINCT i.id) as count FROM images i ${joinClause} ${whereClause}`;
        console.log('  - Count SQL:', countSql);
        console.log('  - Count Params:', params);
        const countResult = await dbGet(countSql, params); // Execute count query
        const totalItems = countResult ? countResult.count : 0;
        const totalPages = Math.ceil(totalItems / limit);

        // --- Data Query (Based ONLY on standard filters for pagination) ---
        const dataSql = `
            SELECT
                i.id, i.filename, i.title, i.description, i.dateAdded
            FROM images i
            ${joinClause}
            ${whereClause}
            ORDER BY ${orderBy} ${sortDir}
            LIMIT ? OFFSET ?
        `;
        const dataParams = [...params, limit, offset];
        console.log('  - Data SQL:', dataSql);
        console.log('  - Data Params:', dataParams);
        const images = await dbAll(dataSql, dataParams); // Execute data query

        // --- Tag Fetching for the retrieved images ---
        let imageIdsForTags = images.map(img => img.id);
        if (filters.alwaysIncludeIds && filters.alwaysIncludeIds.length > 0) {
            filters.alwaysIncludeIds.forEach(id => {
                if (!imageIdsForTags.includes(id)) {
                    imageIdsForTags.push(id);
                }
            });
            const missingIds = filters.alwaysIncludeIds.filter(id => !images.some(img => img.id === id));
            if (missingIds.length > 0) {
                const missingPlaceholders = missingIds.map(() => '?').join(',');
                const missingSql = `SELECT * FROM images WHERE id IN (${missingPlaceholders})`;
                const missingImages = await dbAll(missingSql, missingIds);
                images.push(...missingImages); 
            }
        }

        let tagsByImageId = {};
        if (imageIdsForTags.length > 0) {
            const tagPlaceholders = imageIdsForTags.map(() => '?').join(',');
            const tagsSql = `
                SELECT it.image_id, t.id, t.name, t.color
                FROM image_tags it
                JOIN tags t ON it.tag_id = t.id
                WHERE it.image_id IN (${tagPlaceholders})
            `;
            const tagRows = await dbAll(tagsSql, imageIdsForTags);
            tagRows.forEach(tagRow => {
                if (!tagsByImageId[tagRow.image_id]) {
                    tagsByImageId[tagRow.image_id] = [];
                }
                tagsByImageId[tagRow.image_id].push({
                    id: tagRow.id,
                    name: tagRow.name,
                    color: tagRow.color || DEFAULT_COLOR
                });
            });
        }

        // --- Available Tags Query (Based ONLY on standard filters, NO pagination) ---
        const availableTagsWhereClause = whereClause
            ? `${whereClause} AND it.tag_id IS NOT NULL`
            : 'WHERE it.tag_id IS NOT NULL';
        const availableTagsSql = `
            SELECT DISTINCT it.tag_id
            FROM images i
            ${joinClause}
            LEFT JOIN image_tags it ON i.id = it.image_id
            ${availableTagsWhereClause}
        `;
        const availableTagsParams = [...params];
        const availableTags = await dbAll(availableTagsSql, availableTagsParams);
        const availableFilteredTagIds = availableTags.map(t => t.tag_id);

        // --- Prepare Final Response ---
        const imagesWithTags = images.map(img => ({
            ...img,
            tags: tagsByImageId[img.id] || []
        }));

        const imagesToSend = imagesWithTags.map(img => mergeAndFormat(img));

        if (!filters.search && !filters.tags && !filters.playlistId && !filters.ids) {
            console.log(`✅ GET /api/images - Responding with ${imagesToSend.length} images (unfiltered page). Pagination based on ${totalItems} total items.`);
        } else {
            console.log(`✅ GET /api/images - Responding with ${imagesToSend.length} images (filtered page). Pagination based on ${totalItems} total filtered items.`);
        }

        res.json({
            images: imagesToSend,
            pagination: {
                currentPage: page,
                totalPages: totalPages,
                totalItems: totalItems,
                itemsPerPage: limit
            }, 
            availableFilteredTagIds: availableFilteredTagIds
        });
    // --- End of TRY block ---
    } catch (err) { // Correctly placed catch block
        console.error('❌ GET /api/images - Error fetching images:', err.message);
        next(err); // Pass error to the global error handler
    } // REMOVED ); from here
}); // This should now correctly close the route handler function

/**
 * @route   PUT /api/images/:id
 * @desc    Update an image's title and description
 * @access  Public
 * @param   {number} id - The ID of the image to update.
 * @body    {string} title - The new title for the image.
 * @body    {string} [description] - The new description for the image.
 */
apiRouter.put('/images/:id', async (req, res, next) => {
    const imageId = parseInt(req.params.id, 10);
    console.log(`➡️ PUT /api/images/${imageId} request received`, { title: req.body.title, hasDescription: req.body.description !== undefined, hasTagIds: req.body.tagIds !== undefined });

    // --- Validation ---
    if (isNaN(imageId)) {
        console.warn(`⚠️ PUT /api/images/:id - Invalid ID format: ${req.params.id}`);
        return res.status(400).json({ message: 'Invalid image ID format.' });
    }
    if (!req.body.title || typeof req.body.title !== 'string' || req.body.title.trim().length === 0) {
        console.warn(`⚠️ PUT /api/images/${imageId} - Missing or invalid title.`);
        return res.status(400).json({ message: 'Image title is required and must be a non-empty string.' });
    }
    const trimmedTitle = req.body.title.trim();
    const finalDescription = req.body.description || '';
    const newTagIds = req.body.tagIds; // Get the tagIds array

    // Check if tagIds is provided and is an array
    const shouldUpdateTags = Array.isArray(newTagIds);
    if (shouldUpdateTags) {
        // Optional: Validate tagIds are numbers
        if (!newTagIds.every(id => typeof id === 'number' && !isNaN(id))) {
            console.warn(`⚠️ PUT /api/images/${imageId} - Invalid tagIds format. Must be an array of numbers.`);
            return res.status(400).json({ message: 'Invalid tagIds format. Must be an array of numbers.' });
        }
        console.log(`  - Request includes tag update. New tag IDs: [${newTagIds.join(', ')}]`);
    }

    // --- Check if Image Exists ---
    try {
        const existingImage = await dbGet('SELECT 1 FROM images WHERE id = ?', [imageId]);
        if (!existingImage) {
            console.warn(`⚠️ PUT /api/images/${imageId} - Image not found.`);
            return res.status(404).json({ message: 'Image not found.' });
        }
    } catch (err) {
        console.error(`❌ PUT /api/images/${imageId} - Error checking image existence:`, err.message);
        return next(err); // Pass to global error handler
    }

    // --- Update Logic (Removed Transaction) ---
    // let transactionStarted = false; // REMOVE this flag
    try {
        // REMOVE: await dbRun('BEGIN TRANSACTION');
        // REMOVE: transactionStarted = true;

        // 1. Update title and description in images table
        await dbRun(
            'UPDATE images SET title = ?, description = ? WHERE id = ?',
            [trimmedTitle, finalDescription, imageId]
        );
        console.log(`  - Updated images table for ID ${imageId}.`);

        // 2. Update tags if provided
        if (shouldUpdateTags) {
            // Delete existing tags for this image
            const deleteResult = await dbRun('DELETE FROM image_tags WHERE image_id = ?', [imageId]);
            console.log(`  - Deleted ${deleteResult.changes} existing tag associations for image ID ${imageId}.`);

            // Insert new tags
            if (newTagIds.length > 0) {
                const insertSql = 'INSERT INTO image_tags (image_id, tag_id) VALUES (?, ?)';
                await Promise.all(newTagIds.map(tagId => {
                     return dbRun(insertSql, [imageId, tagId]);
                }));
                 console.log(`  - Inserted ${newTagIds.length} new tag associations for image ID ${imageId}.`);
            }
            // REMOVE: await dbRun('COMMIT');
            // REMOVE: transactionStarted = false;
        }

        console.log(`✅ PUT /api/images/${imageId} - Image update process completed successfully.`);
        res.json({ message: 'Image updated successfully.' });

    } catch (err) {
        console.error(`❌ PUT /api/images/${imageId} - Error during update process:`, err.message);
        // REMOVE: Rollback logic
        // if (transactionStarted) { ... }
        next(err);
    }
});

/**
 * @route   DELETE /api/images/:id
 * @desc    Delete a single image by ID
 * @access  Public
 * @param   {number} id - The ID of the image to delete.
 */
apiRouter.delete('/images/:id', async(req, res, next) => {
    const imageId = parseInt(req.params.id, 10);
    console.log(`➡️ DELETE /api/images/${imageId} request received`);

    if (isNaN(imageId)) {
        console.warn(`⚠️ DELETE /api/images/:id - Invalid ID format: ${req.params.id}`);
        return res.status(400).json({ message: 'Invalid image ID format.' });
    }

    // Note: Using CASCADE DELETE on FKs handles image_tags and playlist_images cleanup
    try {
        // 1. Find the image filename first (for logging and file deletion)
        const row = await dbGet('SELECT filename FROM images WHERE id = ?', [imageId]);
        if (!row) {
            console.warn(`⚠️ DELETE /api/images/${imageId} - Image not found in DB.`);
            return res.status(404).json({ message: 'Image not found.' });
        }
        const filename = row.filename;
        const imagePath = path.join(UPLOAD_DIR, filename);
        const thumbPath = path.join(THUMBNAIL_DIR, filename);

        // 2. Delete the image record from the database (CASCADE handles associations)
        const dbResult = await dbRun('DELETE FROM images WHERE id = ?', [imageId]);
        if (dbResult.changes === 0) {
            console.warn(`⚠️ DELETE /api/images/${imageId} - Image found by SELECT but delete reported 0 changes.`);
            return res.status(404).json({ message: 'Image not found during deletion.' });
        }
        console.log(`  - Deleted image record ${imageId} from database (associations handled by CASCADE).`);

        // 3. Delete the image file and thumbnail file
        try {
            await fs.unlink(imagePath);
            console.log(`  - Deleted image file: ${imagePath}`);
        } catch (fileErr) {
            if (fileErr.code !== 'ENOENT') console.warn(`⚠️ Error deleting image file ${imagePath}:`, fileErr.message);
            else console.log(`  - Image file not found (already deleted?): ${imagePath}`);
        }
        try {
            await fs.unlink(thumbPath);
            console.log(`  - Deleted thumbnail file: ${thumbPath}`);
        } catch (fileErr) {
            if (fileErr.code !== 'ENOENT') console.warn(`⚠️ Error deleting thumbnail file ${thumbPath}:`, fileErr.message);
            else console.log(`  - Thumbnail file not found (already deleted?): ${thumbPath}`);
        }

        console.log(`✅ DELETE /api/images/${imageId} - Image '${filename}' deleted successfully.`);
        res.json({ message: `Image ${filename} deleted successfully.` });

    } catch (err) {
        console.error(`❌ DELETE /api/images/${imageId} - Error deleting image:`, err.message);
        next(err);
    }
});

/**
 * @route   DELETE /api/images
 * @desc    Bulk delete images by an array of IDs
 * @access  Public
 * @body    {number[]} ids - An array of image IDs to delete.
 */
apiRouter.delete('/images', async(req, res, next) => {
    const ids = req.body.ids;
    console.log(`➡️ DELETE /api/images (Bulk) request received for IDs:`, ids);

    if (!Array.isArray(ids) || ids.length === 0) {
        console.warn(`⚠️ DELETE /api/images (Bulk) - Invalid or empty IDs array.`);
        return res.status(400).json({ message: 'Invalid request: \'ids\' must be a non-empty array.' });
    }

    const validIds = ids.map(id => parseInt(id, 10)).filter(id => !isNaN(id));
    if (validIds.length !== ids.length) {
        console.warn(`⚠️ DELETE /api/images (Bulk) - Request contained non-integer IDs. Proceeding with valid ones only.`);
    }
    if (validIds.length === 0) {
        console.warn(`⚠️ DELETE /api/images (Bulk) - No valid integer IDs provided after filtering.`);
        return res.status(400).json({ message: 'Invalid request: No valid IDs provided.' });
    }

    // Use a transaction for atomic deletion
    db.serialize(async() => {
        try {
            await dbRun('BEGIN TRANSACTION');
            const placeholders = validIds.map(() => '?').join(',');

            // 1. Find filenames for the given IDs (for file deletion)
            const rows = await dbAll(`SELECT id, filename FROM images WHERE id IN (${placeholders})`, validIds);
            if (!rows || rows.length === 0) {
                console.warn(`⚠️ DELETE /api/images (Bulk) - No images found for the provided IDs.`);
                await dbRun('ROLLBACK');
                return res.status(404).json({ message: 'No images found for the provided IDs.' });
            }
            console.log(`  - Found ${rows.length} images to delete.`);

            // 2. Delete records from the database (CASCADE handles associations)
            const dbResult = await dbRun(`DELETE FROM images WHERE id IN (${placeholders})`, validIds);
            console.log(`  - Deleted ${dbResult.changes} image records from database (associations handled by CASCADE).`);

            // 3. Delete corresponding files (image and thumbnail)
            let deletedFileCount = 0;
            for (const row of rows) {
                const filename = row.filename;
                const imagePath = path.join(UPLOAD_DIR, filename);
                const thumbPath = path.join(THUMBNAIL_DIR, filename);
                try {
                    await fs.unlink(imagePath);
                    deletedFileCount++;
                    // console.log(`    - Deleted image file: ${imagePath}`); // Less verbose logging
                } catch (fileErr) {
                    if (fileErr.code !== 'ENOENT') console.warn(`    ⚠️ Error deleting image file ${imagePath}:`, fileErr.message);
                }
                try {
                    await fs.unlink(thumbPath);
                    // console.log(`    - Deleted thumbnail file: ${thumbPath}`); // Less verbose logging
                } catch (fileErr) {
                    if (fileErr.code !== 'ENOENT') console.warn(`    ⚠️ Error deleting thumbnail file ${thumbPath}:`, fileErr.message);
                }
            }
            console.log(`  - Attempted deletion of ${rows.length} image/thumbnail file pairs.`);

            await dbRun('COMMIT');
            console.log(`✅ DELETE /api/images (Bulk) - Successfully deleted ${dbResult.changes} images.`);
            res.json({ message: `${dbResult.changes} images deleted successfully.` });

        } catch (err) {
            console.error("❌ DELETE /api/images (Bulk) - Transaction error:", err.message);
            try {
                await dbRun('ROLLBACK');
                console.log("  - Transaction rolled back due to error.");
            } catch (rollbackErr) {
                console.error("  - Failed to rollback transaction:", rollbackErr.message);
            }
            next(err); // Pass error to the main error handler
        }
                    });
                });


// =============================================================================
// API Routes - Tags (/api/tags, /api/entries/tags)
// =============================================================================

/**
 * @route   GET /api/tags
 * @desc    Get all tags with optional image counts.
 * @access  Public
 */
apiRouter.get('/tags', async(req, res, next) => {
    console.log('➡️ GET /api/tags request received');
    try {
        // Join with image_tags to count associated images
        const sql = `
            SELECT 
                t.id, 
                t.name, 
                t.color, 
                COUNT(DISTINCT it.image_id) as imageCount
            FROM tags t
            LEFT JOIN image_tags it ON t.id = it.tag_id
            GROUP BY t.id, t.name, t.color
            ORDER BY LOWER(t.name) ASC
        `;
        const tags = await dbAll(sql);
        console.log(`✅ GET /api/tags - Fetched ${tags.length} tags with image counts.`);
        res.json(tags);
    } catch (err) {
        console.error('❌ GET /api/tags - Error fetching tags:', err.message);
        next(err);
    }
});

/**
 * @route   POST /api/tags
 * @desc    Create a new tag.
 * @access  Public
 * @body    {string} name - The name of the tag to create.
 * @body    {string} [color] - The color for the tag (optional, defaults server-side).
 */
apiRouter.post('/tags', async(req, res, next) => {
    const { name, color } = req.body;
    const tagColor = color || DEFAULT_COLOR;
    console.log(`➡️ POST /api/tags request received`, { name, color: tagColor });

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
        console.warn("⚠️ POST /api/tags - Invalid or missing tag name.");
        return res.status(400).json({ message: 'Tag name is required and must be a non-empty string.' });
    }
    const trimmedName = name.trim();

    if (trimmedName.toLowerCase() === HIDDEN_TAG_NAME.toLowerCase()) {
        console.warn("⚠️ POST /api/tags - Attempt to create protected 'Hidden' tag manually.");
        return res.status(403).json({ message: `Cannot create the protected '${HIDDEN_TAG_NAME}' tag manually.` });
    }

    try {
        // Check if tag already exists (case-insensitive)
        const existingTag = await dbGet('SELECT id FROM tags WHERE LOWER(name) = LOWER(?)', [trimmedName]);
        if (existingTag) {
            console.warn(`⚠️ POST /api/tags - Tag "${trimmedName}" already exists (ID: ${existingTag.id}).`);
            return res.status(409).json({ message: 'Tag already exists.' });
        }

        const result = await dbRun(
            'INSERT INTO tags (name, color) VALUES (?, ?)', [trimmedName, tagColor]
        );

        const newTag = {
            id: result.lastID,
            name: trimmedName,
            color: tagColor
        };
        console.log(`✅ POST /api/tags - Tag "${trimmedName}" created successfully.`, newTag);
        res.status(201).json(newTag);

    } catch (err) {
        console.error(`❌ POST /api/tags - Error creating tag "${trimmedName}":`, err.message);
        if (err.message && err.message.includes('UNIQUE constraint failed')) {
            return res.status(409).json({ message: 'Tag already exists.' });
        }
        next(err);
    }
});

/**
 * @route   PUT /api/tags/:id
 * @desc    Update an existing tag's name.
 * @access  Public
 * @param   {number} id - The ID of the tag to update.
 * @body    {string} name - The new name for the tag.
 */
apiRouter.put('/tags/:id', async(req, res, next) => {
    const tagId = parseInt(req.params.id, 10);
    const { name } = req.body;
    console.log(`➡️ PUT /api/tags/${tagId} request received`, { name });

    if (isNaN(tagId)) {
        console.warn(`⚠️ PUT /api/tags/:id - Invalid ID format: ${req.params.id}`);
        return res.status(400).json({ message: 'Invalid tag ID format.' });
    }
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
        console.warn(`⚠️ PUT /api/tags/${tagId} - Invalid or missing new tag name.`);
        return res.status(400).json({ message: 'New tag name is required and must be a non-empty string.' });
    }
    const trimmedName = name.trim();

    try {
        // Check current tag name
        const currentTag = await dbGet('SELECT name FROM tags WHERE id = ?', [tagId]);
        if (!currentTag) {
            console.warn(`⚠️ PUT /api/tags/${tagId} - Tag not found.`);
            return res.status(404).json({ message: 'Tag not found.' });
        }
        if (currentTag.name === HIDDEN_TAG_NAME) {
            console.warn(`⚠️ PUT /api/tags/${tagId} - Attempted to rename protected '${HIDDEN_TAG_NAME}' tag.`);
            return res.status(403).json({ message: `Cannot rename the protected '${HIDDEN_TAG_NAME}' tag.` });
        }
        // Also prevent renaming *to* 'Hidden'
        if (trimmedName.toLowerCase() === HIDDEN_TAG_NAME.toLowerCase()) {
            console.warn(`⚠️ PUT /api/tags/${tagId} - Attempted to rename tag to protected name '${HIDDEN_TAG_NAME}'.`);
            return res.status(403).json({ message: `Cannot rename tag to the protected name '${HIDDEN_TAG_NAME}'.` });
        }

        // Check if the new name already exists for a *different* tag (case-insensitive)
        const existingTag = await dbGet('SELECT id FROM tags WHERE LOWER(name) = LOWER(?) AND id != ?', [trimmedName, tagId]);
        if (existingTag) {
            console.warn(`⚠️ PUT /api/tags/${tagId} - New name "${trimmedName}" already exists for tag ID ${existingTag.id}.`);
            return res.status(409).json({ message: 'Tag name already exists.' });
        }

        // Update the tag name
        const result = await dbRun('UPDATE tags SET name = ? WHERE id = ?', [trimmedName, tagId]);
        if (result.changes === 0) {
            // Should not happen if first check passed
            console.warn(`⚠️ PUT /api/tags/${tagId} - Tag found but update reported 0 changes.`);
            return res.status(404).json({ message: 'Tag not found during update.' });
        }

        console.log(`✅ PUT /api/tags/${tagId} - Tag updated successfully to "${trimmedName}".`);
        res.json({ message: 'Tag updated successfully.' });

    } catch (err) {
        console.error(`❌ PUT /api/tags/${tagId} - Error updating tag:`, err.message);
        if (err.message && err.message.includes('UNIQUE constraint failed')) {
            return res.status(409).json({ message: 'Tag name already exists.' });
        }
        next(err);
    }
});

/**
 * @route   DELETE /api/tags/:id
 * @desc    Delete a tag (associations handled by CASCADE DELETE).
 * @access  Public
 * @param   {number} id - The ID of the tag to delete.
 */
apiRouter.delete('/tags/:id', async(req, res, next) => {
    const tagId = parseInt(req.params.id, 10);
    console.log(`➡️ DELETE /api/tags/${tagId} request received`);

    if (isNaN(tagId)) {
        console.warn(`⚠️ DELETE /api/tags/:id - Invalid ID format: ${req.params.id}`);
        return res.status(400).json({ message: 'Invalid tag ID format.' });
    }

    try {
        // 1. Check if the tag exists and if it's protected
        const tag = await dbGet('SELECT name FROM tags WHERE id = ?', [tagId]);
        if (!tag) {
            console.warn(`⚠️ DELETE /api/tags/${tagId} - Tag not found.`);
            return res.status(404).json({ message: 'Tag not found.' });
        }
        if (tag.name === HIDDEN_TAG_NAME) {
            console.warn(`⚠️ DELETE /api/tags/${tagId} - Attempted to delete protected '${HIDDEN_TAG_NAME}' tag.`);
            return res.status(403).json({ message: `Cannot delete the protected '${HIDDEN_TAG_NAME}' tag.` });
        }

        // 2. Delete the tag (CASCADE DELETE handles image_tags)
        const result = await dbRun('DELETE FROM tags WHERE id = ?', [tagId]);
        if (result.changes === 0) {
            console.warn(`⚠️ DELETE /api/tags/${tagId} - Tag found but delete reported 0 changes.`);
            return res.status(404).json({ message: 'Tag not found during deletion.' });
        }

        console.log(`✅ DELETE /api/tags/${tagId} - Tag "${tag.name}" deleted successfully (associations handled by CASCADE).`);
        res.json({ message: 'Tag deleted successfully.' });

    } catch (err) {
        console.error(`❌ DELETE /api/tags/${tagId} - Error deleting tag:`, err.message);
        next(err);
    }
});

/**
 * @route   POST /api/entries/tags
 * @desc    Add a tag to multiple image entries.
 * @access  Public
 * @body    {number[]} ids - Array of image IDs.
 * @body    {string} tag - The name of the tag to add.
 */
apiRouter.post('/entries/tags', async(req, res, next) => {
    const { ids, tag: tagName } = req.body;
    console.log(`➡️ POST /api/entries/tags request received`, { imageIds: ids ? ids.length : 0, tagName });

    if (!Array.isArray(ids) || ids.length === 0 || !tagName || typeof tagName !== 'string') {
        console.warn(`⚠️ POST /api/entries/tags - Invalid request body.`);
        return res.status(400).json({ message: 'Invalid request: Requires \'ids\' (non-empty array) and \'tag\' (string).' });
    }
    const validImageIds = ids.map(id => parseInt(id, 10)).filter(id => !isNaN(id));
    if (validImageIds.length === 0) {
        console.warn(`⚠️ POST /api/entries/tags - No valid image IDs provided.`);
        return res.status(400).json({ message: 'Invalid request: No valid image IDs provided.' });
    }
    const trimmedTagName = tagName.trim();

    try {
        // Find the tag ID (case-insensitive)
        const tag = await dbGet('SELECT id FROM tags WHERE LOWER(name) = LOWER(?)', [trimmedTagName]);
        if (!tag) {
            console.warn(`⚠️ POST /api/entries/tags - Tag "${trimmedTagName}" not found.`);
            return res.status(404).json({ message: `Tag "${trimmedTagName}" not found.` });
        }
        const tagId = tag.id;

        // Use INSERT OR IGNORE
        const insertSql = 'INSERT OR IGNORE INTO image_tags (image_id, tag_id) VALUES (?, ?)';
        let changesCount = 0;

        await dbRun('BEGIN TRANSACTION');
        for (const imageId of validImageIds) {
            // Optional: Verify imageId exists?
            // const imageExists = await dbGet('SELECT 1 FROM images WHERE id = ?', [imageId]);
            // if (imageExists) {
            await dbRun(insertSql, [imageId, tagId]);
            changesCount++;
            // }
        }
        await dbRun('COMMIT');

        console.log(`✅ POST /api/entries/tags - Associated tag "${trimmedTagName}" (ID: ${tagId}) with ${changesCount} new entries out of ${validImageIds.length} requested.`);
        res.json({ message: `Tag "${trimmedTagName}" added to selected entries.` });

    } catch (err) {
        console.error(`❌ POST /api/entries/tags - Error associating tag "${trimmedTagName}":`, err.message);
        try {
            await dbRun('ROLLBACK');
            console.log("  - Transaction rolled back.");
        } catch (e) { console.error('  - Rollback failed', e); }
        next(err);
    }
});

/**
 * @route   DELETE /api/entries/tags
 * @desc    Remove a tag from multiple image entries.
 * @access  Public
 * @body    {number[]} ids - Array of image IDs.
 * @body    {string} tag - The name of the tag to remove.
 */
apiRouter.delete('/entries/tags', async(req, res, next) => {
    const { ids, tag: tagName } = req.body;
    console.log(`➡️ DELETE /api/entries/tags request received`, { imageIds: ids ? ids.length : 0, tagName });

    if (!Array.isArray(ids) || ids.length === 0 || !tagName || typeof tagName !== 'string') {
        console.warn(`⚠️ DELETE /api/entries/tags - Invalid request body.`);
        return res.status(400).json({ message: 'Invalid request: Requires \'ids\' (non-empty array) and \'tag\' (string).' });
    }
    const validImageIds = ids.map(id => parseInt(id, 10)).filter(id => !isNaN(id));
    if (validImageIds.length === 0) {
        console.warn(`⚠️ DELETE /api/entries/tags - No valid image IDs provided.`);
        return res.status(400).json({ message: 'Invalid request: No valid image IDs provided.' });
    }
    const trimmedTagName = tagName.trim();

    try {
        // Find the tag ID (case-insensitive)
        const tag = await dbGet('SELECT id FROM tags WHERE LOWER(name) = LOWER(?)', [trimmedTagName]);
        if (!tag) {
            // Not an error if tag doesn't exist, just means no associations to remove
            console.log(`✅ DELETE /api/entries/tags - Tag "${trimmedTagName}" not found, no associations to remove.`);
            return res.json({ message: `Tag "${trimmedTagName}" not found or already removed from selected entries.` });
        }
        const tagId = tag.id;

        // Delete associations
        const placeholders = validImageIds.map(() => '?').join(',');
        const deleteSql = `DELETE FROM image_tags WHERE tag_id = ? AND image_id IN (${placeholders})`;
        const result = await dbRun(deleteSql, [tagId, ...validImageIds]);

        console.log(`✅ DELETE /api/entries/tags - Removed tag "${trimmedTagName}" (ID: ${tagId}) from ${result.changes} entries for ${validImageIds.length} requested IDs.`);
        res.json({ message: `Tag "${trimmedTagName}" removed from selected entries.` });

    } catch (err) {
        console.error(`❌ DELETE /api/entries/tags - Error removing tag "${trimmedTagName}":`, err.message);
        next(err);
    }
});


// =============================================================================
// API Routes - Playlists (/api/playlists)
// =============================================================================

/**
 * Helper function to load playlists with associated image IDs.
 * @returns {Promise<Array<object>>} Promise resolving with an array of playlist objects.
 */
async function loadPlaylistsWithImages() {
    const sql = `
        SELECT
            p.id, p.name, p.color, p.is_hidden, p.created_at,
            GROUP_CONCAT(pi.image_id) as image_ids_str
        FROM playlists p
        LEFT JOIN playlist_images pi ON p.id = pi.playlist_id
        GROUP BY p.id
        ORDER BY p.name COLLATE NOCASE -- Case-insensitive sorting
    `;
    const rows = await dbAll(sql);
    return rows.map(row => ({
            id: row.id,
            name: row.name,
        color: row.color || DEFAULT_COLOR,
            hidden: row.is_hidden === 1,
            createdAt: row.created_at,
        imageIds: row.image_ids_str ? row.image_ids_str.split(',').map(Number).filter(id => !isNaN(id)) : [] // Ensure IDs are numbers
    }));
}

/**
 * @route   GET /api/playlists
 * @desc    Get all playlists with their associated image IDs.
 * @access  Public
 */
apiRouter.get('/playlists', async(req, res, next) => {
    console.log("➡️ GET /api/playlists request received");
    try {
        const playlists = await loadPlaylistsWithImages();
        console.log(`✅ GET /api/playlists - Responding with ${playlists.length} playlists.`);
        res.json(playlists);
    } catch (err) {
        console.error("❌ GET /api/playlists - Error fetching playlists:", err.message);
        next(err);
    }
});

/**
 * @route   POST /api/playlists
 * @desc    Save/Update playlists (Bulk operation: Replaces all playlists!).
 *          NOTE: Consider individual CRUD endpoints for better efficiency and RESTfulness.
 * @access  Public
 * @body    {Array<object>} playlists - The complete array of playlist objects to save.
 */


/**
 * @route   POST /api/playlists/:id/images
 * @desc    Add images to a playlist.
 * @access  Public
 * @param   {number} id - The ID of the playlist to update.
 * @body    {number[]} imageIds - An array of image IDs to add to the playlist.
 */
// *** New POST endpoint for creating a single playlist (Should remain active) ***\
apiRouter.post('/playlists', async (req, res, next) => {
    console.log('<<<<< EXECUTION REACHED SINGLE PLAYLIST POST HANDLER >>>>>'); 
    const { name, color, is_hidden } = req.body;
    console.log(`➡️ POST /api/playlists (Create Single) request received`, req.body);

    // --- Validation ---\
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
        console.warn("⚠️ POST /api/playlists - Invalid or missing playlist name.");
        return res.status(400).json({ message: 'Playlist name is required and must be a non-empty string.' });
    }
    const trimmedName = name.trim();
    // *** FIX: Use the defined DEFAULT_COLOR constant ***
    const finalColor = color || DEFAULT_COLOR || '#8a3ffc'; 
    const finalIsHidden = is_hidden === true ? 1 : 0;
    const createdAt = new Date().toISOString();

    // Check for duplicate name (case-insensitive)
    try {
        const existing = await dbGet('SELECT id FROM playlists WHERE LOWER(name) = LOWER(?)', [trimmedName]);
        if (existing) {
            console.warn(`⚠️ POST /api/playlists - Playlist name conflict: \\"${trimmedName}\\"`);
            return res.status(409).json({ message: `Playlist name \\"${trimmedName}\\" already exists.` });
        }
    } catch (err) {
        console.error("❌ POST /api/playlists - Error checking for existing playlist:", err.message);
        return next(err);
    }

    // --- Insertion ---
    try {
        const result = await dbRun(
            'INSERT INTO playlists (name, color, is_hidden, created_at) VALUES (?, ?, ?, ?)',
            [trimmedName, finalColor, finalIsHidden, createdAt]
        );

        const newPlaylist = await dbGet('SELECT * FROM playlists WHERE id = ?', [result.lastID]);
        
        if (!newPlaylist) {
             throw new Error('Failed to retrieve newly created playlist after insertion.');
        }

        console.log(`✅ POST /api/playlists - Created playlist ID ${newPlaylist.id} (\\"${newPlaylist.name}\\")`);
        res.status(201).json({
            id: newPlaylist.id,
            name: newPlaylist.name,
            color: newPlaylist.color,
            hidden: newPlaylist.is_hidden === 1,
            createdAt: newPlaylist.created_at,
            imageIds: [] 
        });

    } catch (err) {
        console.error(`❌ POST /api/playlists - Error inserting new playlist \\"${trimmedName}\\"`, err.message);
        next(err); 
    }
});

/**\
 * @route   POST /api/playlists/:id/images\
 * @desc    Remove an image from a playlist.
 * @access  Public
 * @param   {number} id - The ID of the playlist to update.
 * @param   {number} imageId - The ID of the image to remove from the playlist.
 */
apiRouter.delete('/playlists/:id/images/:imageId', async(req, res, next) => {
    const playlistId = parseInt(req.params.id, 10);
    const imageId = parseInt(req.params.imageId, 10);
    console.log(`➡️ DELETE /api/playlists/${playlistId}/images/${imageId} request received`);

    if (isNaN(playlistId)) {
        console.warn(`⚠️ DELETE /api/playlists/:id - Invalid ID format: ${req.params.id}`);
        return res.status(400).json({ message: 'Invalid playlist ID format.' });
    }
    if (isNaN(imageId)) {
        console.warn(`⚠️ DELETE /api/playlists/:id/images/:imageId - Invalid ID format: ${req.params.imageId}`);
        return res.status(400).json({ message: 'Invalid image ID format.' });
    }

    // Use a transaction for atomic deletion
    db.serialize(async() => {
        try {
            await dbRun('BEGIN TRANSACTION');

            // 1. Find the image ID for the given playlist and image
            const row = await dbGet('SELECT image_id FROM playlist_images WHERE playlist_id = ? AND image_id = ?', [playlistId, imageId]);
            if (!row) {
                console.warn(`⚠️ DELETE /api/playlists/${playlistId}/images/${imageId} - Image not found in playlist.`);
                await dbRun('ROLLBACK');
                return res.status(404).json({ message: 'Image not found in playlist.' });
            }

            // 2. Delete the image record from the database
            const dbResult = await dbRun('DELETE FROM playlist_images WHERE playlist_id = ? AND image_id = ?', [playlistId, imageId]);
            if (dbResult.changes === 0) {
                console.warn(`⚠️ DELETE /api/playlists/${playlistId}/images/${imageId} - Association not found during deletion.`);
                await dbRun('ROLLBACK'); // Rollback if no change happened
                return res.status(404).json({ message: 'Image association not found in playlist.' });
            }
            console.log(`  - Deleted association for image ${imageId} from playlist ${playlistId}.`);

            // 3. REMOVE FILE DELETION LOGIC - We only remove the association
            /*
            try {
                await fs.unlink(path.join(UPLOAD_DIR, row.filename)); // row.filename is not available here!
                console.log(`  - Deleted image file: ${path.join(UPLOAD_DIR, row.filename)}`);
            } catch (fileErr) { ... }
            try {
                await fs.unlink(path.join(THUMBNAIL_DIR, row.filename));
                console.log(`  - Deleted thumbnail file: ${path.join(THUMBNAIL_DIR, row.filename)}`);
            } catch (fileErr) { ... }
            */

            await dbRun('COMMIT');
            console.log(`✅ DELETE /api/playlists/${playlistId}/images/${imageId} - Image association removed successfully.`);
            res.json({ message: `Image removed from playlist ${playlistId}.` });

        } catch (err) {
            console.error(`❌ DELETE /api/playlists/${playlistId}/images/${imageId} - Error removing image from playlist:`, err.message);
            try {
                await dbRun('ROLLBACK');
                console.log("  - Transaction rolled back due to error.");
            } catch (rollbackErr) {
                console.error("  - Failed to rollback transaction:", rollbackErr.message);
            }
            next(err); // Pass error to the main error handler
        }
    });
});

/**
 * @route   PUT /api/playlists/:id
 * @desc    Update a playlist's name, color, or hidden status.
 * @access  Public
 * @param   {number} id - The ID of the playlist to update.
 * @body    {string} [name] - The new name for the playlist (optional).
 * @body    {string} [color] - The new color for the playlist (optional).
 * @body    {boolean} [is_hidden] - Whether the playlist is hidden (optional).
 */
apiRouter.put('/playlists/:id', async(req, res, next) => {
    const playlistId = parseInt(req.params.id, 10);
    console.log(`➡️ PUT /api/playlists/${playlistId} request received`, req.body);

    // --- Validation ---
    if (isNaN(playlistId)) {
        console.warn(`⚠️ PUT /api/playlists/:id - Invalid ID format: ${req.params.id}`);
        return res.status(400).json({ message: 'Invalid playlist ID format.' });
    }

    const updates = {};
    if (req.body.name !== undefined) {
        if (typeof req.body.name !== 'string' || req.body.name.trim().length === 0) {
            return res.status(400).json({ message: 'Playlist name must be a non-empty string.' });
        }
        updates.name = req.body.name.trim();
    }
    if (req.body.color !== undefined) {
        if (typeof req.body.color !== 'string' || req.body.color.trim().length === 0) {
            // Basic check, could add regex for hex color format
            return res.status(400).json({ message: 'Playlist color must be a non-empty string.' });
        }
        updates.color = req.body.color.trim();
    }
    if (req.body.is_hidden !== undefined) {
        if (typeof req.body.is_hidden !== 'boolean') {
             return res.status(400).json({ message: 'Playlist hidden status must be a boolean.' });
        }
        updates.is_hidden = req.body.is_hidden ? 1 : 0;
    }

    if (Object.keys(updates).length === 0) {
        return res.status(400).json({ message: 'No valid fields provided for update.' });
    }

    // --- Update Logic ---
    try {
        // Check for name conflict IF name is being updated
        if (updates.name) {
             const existing = await dbGet(
                 'SELECT id FROM playlists WHERE LOWER(name) = LOWER(?) AND id != ?',
                 [updates.name, playlistId]
             );
             if (existing) {
                 console.warn(`⚠️ PUT /api/playlists/${playlistId} - Playlist name conflict: "${updates.name}"`);
                 return res.status(409).json({ message: `Playlist name "${updates.name}" already exists.` });
             }
        }

        // Construct dynamic UPDATE query
        const setClauses = Object.keys(updates).map(key => `${key} = ?`).join(', ');
        const values = [...Object.values(updates), playlistId];
        const sql = `UPDATE playlists SET ${setClauses} WHERE id = ?`;

        console.log(`  - Executing SQL: ${sql} with values:`, values);
        const result = await dbRun(sql, values);

        if (result.changes === 0) {
            // Check if the playlist actually exists before saying 'not found'
            const exists = await dbGet('SELECT 1 FROM playlists WHERE id = ?', [playlistId]);
            if (!exists) {
                 console.warn(`⚠️ PUT /api/playlists/${playlistId} - Playlist not found.`);
                 return res.status(404).json({ message: 'Playlist not found.' });
            } else {
                // Playlist exists, but no changes were made (maybe values were the same?)
                 console.log(`✅ PUT /api/playlists/${playlistId} - Playlist updated (no effective changes).`);
                 return res.json({ message: 'Playlist updated successfully (no changes detected).' });
            }
        }

        console.log(`✅ PUT /api/playlists/${playlistId} - Playlist updated successfully.`);
        res.json({ message: 'Playlist updated successfully.' });

    } catch (err) {
        console.error(`❌ PUT /api/playlists/${playlistId} - Error updating playlist:`, err.message);
        // Handle potential UNIQUE constraint error if the pre-check somehow failed
         if (err.message && err.message.includes('UNIQUE constraint failed')) {
             return res.status(409).json({ message: `Playlist name "${updates.name}" already exists.` });
         }
        next(err);
    }
});

/**
 * @route   POST /api/playlists/:id/images
 * @desc    Add images to a playlist.
 * @access  Public
 * @param   {number} id - The ID of the playlist to update.
 * @body    {number[]} imageIds - An array of image IDs to add to the playlist.
 */
apiRouter.post('/playlists/:id/images', async(req, res, next) => {
    const playlistId = parseInt(req.params.id, 10);
    const imageIds = req.body.imageIds;
    console.log(`➡️ POST /api/playlists/${playlistId}/images request received`, { imageIds });

    if (isNaN(playlistId)) {
        console.warn(`⚠️ POST /api/playlists/:id - Invalid ID format: ${req.params.id}`);
        return res.status(400).json({ message: 'Invalid playlist ID format.' });
    }
    if (!Array.isArray(imageIds) || imageIds.length === 0) {
        console.warn(`⚠️ POST /api/playlists/:id - Invalid image IDs format: ${req.body.imageIds}`);
        return res.status(400).json({ message: 'Invalid image IDs format. Must be a non-empty array.' });
    }

    // Use a transaction for atomic insertion
    db.serialize(async() => {
        try {
            await dbRun('BEGIN TRANSACTION');

            // 1. Find the playlist ID for the given playlist
            const playlist = await dbGet('SELECT id FROM playlists WHERE id = ?', [playlistId]);
            if (!playlist) {
                console.warn(`⚠️ POST /api/playlists/${playlistId} - Playlist not found.`);
                await dbRun('ROLLBACK');
                return res.status(404).json({ message: 'Playlist not found.' });
            }

            // 2. Insert images into the playlist_images table one by one
            const insertSql = 'INSERT OR IGNORE INTO playlist_images (playlist_id, image_id) VALUES (?, ?)'; // Added OR IGNORE
            let insertedCount = 0;
            for (const imageId of imageIds) {
                // Optional: Check if image exists?
                    // const imageExists = await dbGet('SELECT 1 FROM images WHERE id = ?', [imageId]);
                    // if (imageExists) {
                const result = await dbRun(insertSql, [playlistId, imageId]);
                insertedCount += result.changes; // Count actual insertions
                    // }
            }

            // 3. Commit the transaction
            await dbRun('COMMIT');

            console.log(`✅ POST /api/playlists/${playlistId}/images - Added/ignored ${insertedCount} image associations.`);
            res.json({ message: `Images processed for playlist ${playlistId}. ${insertedCount} new associations added.` });

        } catch (err) {
            console.error(`❌ POST /api/playlists/${playlistId}/images - Error adding images to playlist:`, err.message);
            try {
                await dbRun('ROLLBACK');
                console.log("  - Transaction rolled back due to error.");
            } catch (rollbackErr) {
                console.error("  - Failed to rollback transaction:", rollbackErr.message);
            }
            next(err); // Pass error to the main error handler
        }
    });
});

/**
 * @route   DELETE /api/playlists/:id
 * @desc    Delete a playlist and its associations (handled by CASCADE).
 * @access  Public
 * @param   {number} id - The ID of the playlist to delete.
 */
apiRouter.delete('/playlists/:id', async(req, res, next) => {
    const playlistId = parseInt(req.params.id, 10);
    console.log(`➡️ DELETE /api/playlists/${playlistId} request received`);

    if (isNaN(playlistId)) {
        console.warn(`⚠️ DELETE /api/playlists/:id - Invalid ID format: ${req.params.id}`);
        return res.status(400).json({ message: 'Invalid playlist ID format.' });
    }

    try {
        // Check if playlist exists first (optional but good for 404 response)
        const exists = await dbGet('SELECT name FROM playlists WHERE id = ?', [playlistId]);
        if (!exists) {
            console.warn(`⚠️ DELETE /api/playlists/${playlistId} - Playlist not found.`);
            return res.status(404).json({ message: 'Playlist not found.' });
        }
        const playlistName = exists.name; // For logging

        // Delete the playlist (CASCADE constraint handles playlist_images)
        const result = await dbRun('DELETE FROM playlists WHERE id = ?', [playlistId]);

        if (result.changes === 0) {
            // Should not happen if the SELECT check passed, but handle defensively
            console.warn(`⚠️ DELETE /api/playlists/${playlistId} - Playlist found but delete reported 0 changes.`);
            return res.status(404).json({ message: 'Playlist not found during deletion.' });
        }

        console.log(`✅ DELETE /api/playlists/${playlistId} - Playlist "${playlistName}" deleted successfully (associations handled by CASCADE).`);
        res.json({ message: `Playlist "${playlistName}" deleted successfully.` }); // Or res.status(204).send();

    } catch (err) {
        console.error(`❌ DELETE /api/playlists/${playlistId} - Error deleting playlist:`, err.message);
            next(err);
        }
});


// =============================================================================
// API Route - Slideshow Control (/api/updateSlideshow)
// =============================================================================
/**
 * @route   POST /api/updateSlideshow
 * @desc    Handles various slideshow control actions via Socket.IO events.
 * @access  Public
 */
apiRouter.post('/updateSlideshow', async(req, res, next) => {
    // Destructure the new parameter
    const { action, speed, order, imageUrl, title, description, images, showTextOverlay } = req.body;
    console.log(`➡️ POST /api/updateSlideshow request received`, { action, speed, order, imageUrl, title, description: description !== undefined, imagesCount: images ? images.length : undefined, showTextOverlay });

    try {
        switch (action) {
            case 'next':
            case 'prev':
                console.log(`  - Emitting 'slideAction': ${action}`);
                io.emit('slideAction', { action });
                return res.json({ message: `Navigation action '${action}' broadcasted.` }); // Return early

            case 'updateSettings':
                // Validate the new parameter
                if (typeof speed !== 'number' || speed < 0 || typeof order !== 'string' || typeof showTextOverlay !== 'boolean') {
                    console.warn(`⚠️ /api/updateSlideshow - Invalid payload for 'updateSettings':`, { speed, order, showTextOverlay });
                    return res.status(400).json({ message: 'Invalid payload for updateSettings action (requires valid speed, order, and showTextOverlay boolean).' });
                }
                const settingsPayload = { speed, order, showTextOverlay }; // Include in payload
                console.log(`  - Emitting 'settingsUpdate':`, settingsPayload);
                io.emit('settingsUpdate', settingsPayload);
                return res.json({ message: 'Slideshow settings update broadcasted.' }); // Return early

            case 'play':
                if (!imageUrl || !title || typeof imageUrl !== 'string' || typeof title !== 'string') {
                    console.warn(`⚠️ /api/updateSlideshow - Invalid payload for 'play':`, { imageUrl, title });
                    return res.status(400).json({ message: 'Invalid payload for play action (requires imageUrl and title strings).' });
                }
                const playPayload = { imageUrl, title, description: description || '' };
                console.log(`  - Emitting 'playImage':`, playPayload);
                io.emit('playImage', playPayload);
                return res.json({ message: 'Play specific image broadcasted.' }); // Return early

            case 'playSelect':
                if (!Array.isArray(images) || typeof speed !== 'number' || speed < 0 || typeof order !== 'string') {
                    console.warn(`⚠️ /api/updateSlideshow - Invalid payload for 'playSelect':`, { imagesIsArray: Array.isArray(images), speed, order });
                    return res.status(400).json({ message: 'Invalid payload for playSelect action (requires images array, valid speed, and order).' });
                }

                const MAX_IMAGES_PAYLOAD = 1000; // Adjust limit as needed
                if (images.length > MAX_IMAGES_PAYLOAD) {
                    console.warn(`⚠️ /api/updateSlideshow - Payload too large for 'playSelect': ${images.length} images.`);
                    return res.status(413).json({ message: `Payload too large. Maximum ${MAX_IMAGES_PAYLOAD} images allowed.` });
                }

                console.log('  - Fetching hidden image IDs for filtering...');
                const hiddenTag = await dbGet('SELECT id FROM tags WHERE name = ?', [HIDDEN_TAG_NAME]);
                let hiddenImageIds = new Set();
                if (hiddenTag) {
                    const hiddenImages = await dbAll('SELECT image_id FROM image_tags WHERE tag_id = ?', [hiddenTag.id]);
                    hiddenImageIds = new Set(hiddenImages.map(row => row.image_id));
                    console.log(`    - Found ${hiddenImageIds.size} hidden image IDs.`);
                } else {
                    console.log(`    - '${HIDDEN_TAG_NAME}' tag not found, no images will be filtered out as hidden.`);
                }

                // Filter the provided images list and ensure structure
                const imagesToPlay = images
                    .filter(img => img && typeof img.id !== 'undefined' && !hiddenImageIds.has(img.id))
                    .map(img => ({
                        id: img.id, // Ensure ID is present
                        url: img.url || '', // Ensure URL is string
                        title: img.title || '', // Ensure title is string
                        description: img.description || '' // Ensure description is string
                    }));

                console.log(`  - Filtered list contains ${imagesToPlay.length} images (removed ${images.length - imagesToPlay.length} hidden or invalid).`);

                const playSelectPayload = { images: imagesToPlay, speed, order };
                console.log(`  - Emitting 'playSelect':`, { imagesCount: imagesToPlay.length, speed, order });
                io.emit('playSelect', playSelectPayload);
                return res.json({ message: 'Play selection broadcasted.' }); // Return early

            default:
                console.warn(`⚠️ /api/updateSlideshow - Unknown action: ${action}`);
                return res.status(400).json({ message: `Unknown action: ${action}` });
        }
    } catch (err) {
        console.error(`❌ /api/updateSlideshow - Error processing action '${action}':`, err.message);
        next(err);
    }
});

// =============================================================================
// API Route - Play by Tags (/api/playTags)
// =============================================================================
/**
 * @route   POST /api/playTags
 * @desc    Fetches images associated with given tags and initiates a slideshow.
 * @access  Public
 * @body    {string[]} tags - An array of tag names.
 */
apiRouter.post('/playTags', async (req, res, next) => {
    const { tags } = req.body;
    console.log(`➡️ POST /api/playTags request received`, { tags });
    // *** ADD LOG HERE ***
    console.log(`[SERVER /api/playTags] Received tags in request body:`, tags);

    // Check if tags array is empty - treat as request for 'all'
    const playAll = !Array.isArray(tags) || tags.length === 0;

    if (!playAll && (!Array.isArray(tags))) { // Only error if not playing all and tags is not array
        console.warn(`⚠️ /api/playTags - Invalid payload:`, req.body);
        return res.status(400).json({ message: 'Invalid payload: Requires an array of tags.' });
    }

    try {
        let imageIds = [];

        if (!playAll) {
            // 1. Find tag IDs for the given names (if tags provided)
            const placeholders = tags.map(() => '?').join(',');
            const tagObjects = await dbAll(`SELECT id, name FROM tags WHERE lower(name) IN (${placeholders})`, tags.map(t => t.toLowerCase()));
            const tagIds = tagObjects.map(t => t.id);
            // *** ADD LOG ***
            console.log(`[SERVER /api/playTags] Found tag IDs:`, tagIds);

            if (tagIds.length === 0) {
                console.warn(`⚠️ /api/playTags - No valid tags found for names:`, tags);
                return res.status(404).json({ message: 'No images found for the specified tags.' });
            }

            // 2. Find image IDs associated with ANY of these tags (if tags provided)
            const imageIdPlaceholders = tagIds.map(() => '?').join(',');
            const imageTagLinks = await dbAll(
                `SELECT DISTINCT image_id FROM image_tags WHERE tag_id IN (${imageIdPlaceholders})`,
                tagIds
            );
            imageIds = imageTagLinks.map(link => link.image_id);
            // *** ADD LOG ***
            console.log(`[SERVER /api/playTags] Image IDs after DISTINCT query (OR logic):`, imageIds);

        } else {
            // 3a. If playing all, get all image IDs (this could be optimized)
            console.log('  - Play All requested, fetching all image IDs.');
            const allImageLinks = await dbAll('SELECT id FROM images');
            imageIds = allImageLinks.map(link => link.id);
        }

        if (imageIds.length === 0) {
            console.warn(`⚠️ /api/playTags - No images found for the criteria (Tags: ${playAll ? '[ALL]' : tags.join(',')}).`);
            return res.status(404).json({ message: 'No images found for the specified criteria.' });
        }

        // 4. Fetch full image details for these IDs (excluding hidden by default)
        const imageDetailPlaceholders = imageIds.map(() => '?').join(',');
        const hiddenTagId = await getHiddenTagId(); 
        
        let imagesSql = `SELECT * FROM images WHERE id IN (${imageDetailPlaceholders})`;
        const sqlParams = [...imageIds];
        
        if (hiddenTagId !== null) {
            imagesSql += ` AND id NOT IN (SELECT image_id FROM image_tags WHERE tag_id = ?)`;
            sqlParams.push(hiddenTagId);
        }
        // Apply default sort for 'all' or tag-based?
        imagesSql += ' ORDER BY dateAdded DESC'; // Example: Sort all by date added

        const images = await dbAll(imagesSql, sqlParams);

        // --- NEW: Fetch Tags for these specific images ---
        let tagsByImageId = {};
        if (imageIds.length > 0) { // Only fetch tags if we have images
            const tagPlaceholders = imageIds.map(() => '?').join(',');
            const tagsSql = `
                SELECT it.image_id, t.id, t.name, t.color
                FROM image_tags it
                JOIN tags t ON it.tag_id = t.id
                WHERE it.image_id IN (${tagPlaceholders})
            `;
            const tagRows = await dbAll(tagsSql, imageIds);
            console.log(`[SERVER /api/playTags] Fetched ${tagRows.length} tag associations for ${imageIds.length} images.`);
            tagRows.forEach(tagRow => {
                if (!tagsByImageId[tagRow.image_id]) {
                    tagsByImageId[tagRow.image_id] = [];
                }
                tagsByImageId[tagRow.image_id].push({
                    id: tagRow.id,
                    name: tagRow.name,
                    color: tagRow.color || DEFAULT_COLOR
                });
            });
        }
        // --- END NEW TAG FETCH ---

        // --- Modify Formatting to include fetched tags ---
        const formattedImages = images.map(img => {
            const baseFormatted = mergeAndFormat(img); // Gets basic details + URLs
            return {
                ...baseFormatted,
                tags: tagsByImageId[img.id] || [] // Add the fetched tags array, default to empty array
            };
        });

        const sourceDescription = playAll ? '[ALL]' : `tags [${tags.join(',')}]`;
        if (formattedImages.length === 0) {
             console.warn(`⚠️ /api/playTags - All images for ${sourceDescription} were hidden.`);
             return res.status(404).json({ message: `No visible images found for ${sourceDescription}.` });
        }

        // 5. Get current slideshow settings
        const currentSpeed = globalAppSettings.slideshowSpeed || 3;
        const currentOrder = globalAppSettings.slideshowOrder || 'random';

        // 6. Emit socket event
        const payload = {
            sourceType: playAll ? 'all' : 'tags', // Set sourceType correctly
            sourceDetails: playAll ? null : tags, // Set sourceDetails correctly
            images: formattedImages,
            speed: currentSpeed,
            order: currentOrder
        };
        // *** ADD LOG ***
        console.log(`[SERVER /api/playTags] Final formatted image count before emit: ${formattedImages.length}`);
        // *** ADD DETAILED LOGGING of the first few image objects ***
        console.log(`[SERVER /api/playTags] First 3 formatted images being sent:`, JSON.stringify(formattedImages.slice(0, 3), null, 2)); 
        console.log(`[SERVER /api/playTags] Entire formattedImages object being sent:`, formattedImages);
        // *** END ADDED LOGGING ***
        console.log(`  - Emitting 'playSelect' for ${sourceDescription} with ${formattedImages.length} images.`);
        io.emit('playSelect', payload);

        res.json({ message: `Slideshow initiated for ${sourceDescription}` });

    } catch (err) {
        console.error(`❌ /api/playTags - Error processing request:`, err.message);
        next(err);
    }
});

// =============================================================================
// API Route - Play by Playlist (/api/playPlaylist)
// =============================================================================
/**
 * @route   POST /api/playPlaylist
 * @desc    Fetches images associated with a given playlist and initiates a slideshow.
 * @access  Public
 * @body    {number} playlistId - The ID of the playlist.
 */
apiRouter.post('/playPlaylist', async (req, res, next) => {
    const { playlistId } = req.body;
    console.log(`➡️ POST /api/playPlaylist request received`, { playlistId });

    if (typeof playlistId !== 'number' || isNaN(playlistId)) {
        console.warn(`⚠️ /api/playPlaylist - Invalid payload:`, req.body);
        return res.status(400).json({ message: 'Invalid payload: Requires a numeric playlistId.' });
    }

    try {
        // 1. Check if playlist exists
        const playlist = await dbGet('SELECT id, name FROM playlists WHERE id = ?', [playlistId]);
        if (!playlist) {
            console.warn(`⚠️ /api/playPlaylist - Playlist ID ${playlistId} not found.`);
            return res.status(404).json({ message: 'Playlist not found.' });
        }

        // 2. Get image IDs associated with this playlist
        const imageLinks = await dbAll('SELECT image_id FROM playlist_images WHERE playlist_id = ?', [playlistId]);
        const imageIds = imageLinks.map(link => link.image_id);

        if (imageIds.length === 0) {
            console.warn(`⚠️ /api/playPlaylist - No images found in playlist: ${playlist.name} (ID: ${playlistId})`);
            return res.status(404).json({ message: `No images found in playlist "${playlist.name}".` });
        }

        // 3. Fetch full image details for these IDs (excluding hidden by default)
        const imageDetailPlaceholders = imageIds.map(() => '?').join(',');
        const hiddenTagId = await getHiddenTagId(); // Helper to get the ID of the 'hidden' tag
        
        let imagesSql = `SELECT * FROM images WHERE id IN (${imageDetailPlaceholders})`;
        const sqlParams = [...imageIds];
        
        if (hiddenTagId !== null) {
            imagesSql += ` AND id NOT IN (SELECT image_id FROM image_tags WHERE tag_id = ?)`;
            sqlParams.push(hiddenTagId);
        }
        
        // Add ordering based on playlist order (if implemented - default for now)
        // imagesSql += ' ORDER BY ...'; // Needs a way to store order in playlist_images

        const images = await dbAll(imagesSql, sqlParams);
        const formattedImages = images.map(img => mergeAndFormat(img)); // Assuming mergeAndFormat exists

        if (formattedImages.length === 0) {
             console.warn(`⚠️ /api/playPlaylist - All images for playlist ${playlist.name} (ID: ${playlistId}) were hidden.`);
             return res.status(404).json({ message: `No visible images found for playlist "${playlist.name}".` });
        }

        // 4. Get current slideshow settings (example)
        const currentSpeed = globalAppSettings.slideshowSpeed || 3;
        const currentOrder = globalAppSettings.slideshowOrder || 'random'; // Playlist order might override this

        // 5. Emit socket event
        const payload = {
            sourceType: 'playlist', // Add sourceType
            sourceDetails: playlistId, // Add original playlist ID
            images: formattedImages,
            speed: currentSpeed,
            order: currentOrder // Or potentially a specific 'playlist' order
        };
        console.log(`  - Emitting 'playSelect' for playlist [${playlist.name}] with ${formattedImages.length} images.`);
        io.emit('playSelect', payload);

        res.json({ message: `Slideshow initiated for playlist: ${playlist.name}` });

    } catch (err) {
        console.error(`❌ /api/playPlaylist - Error processing request:`, err.message);
        next(err);
    }
});

// =============================================================================
// API Route - Slideshow Control (/api/slideshowControl)
// =============================================================================
/**
 * @route   POST /api/slideshowControl
 * @desc    Sends control commands to the slideshow.
 * @access  Public
 * @body    {string} action - The control action ('next', 'prev', 'togglePause', 'reset').
 */
apiRouter.post('/slideshowControl', async(req, res, next) => {
    const { action } = req.body;
    console.log(`➡️ POST /api/slideshowControl request received`, { action });

    try {
        switch (action) {
            case 'next':
            case 'prev':
            case 'togglePause':
            case 'reset': // Added reset case
                console.log(`  - Emitting 'slideAction': ${action}`);
                io.emit('slideAction', { action }); // Emit standard slideAction for client to handle
                return res.json({ message: `Slideshow action '${action}' broadcasted.` });
            default:
                console.warn(`⚠️ /api/slideshowControl - Invalid action: ${action}`);
                return res.status(400).json({ message: 'Invalid slideshow action.' });
        }
    } catch (err) {
        console.error(`❌ /api/slideshowControl - Error processing action '${action}':`, err.message);
        next(err);
    }
});

// =============================================================================
// API Route - Update Slideshow Settings (/api/updateSlideshow) - KEPT FOR COMPATIBILITY?
// =============================================================================
/**
 * @route   POST /api/updateSlideshow
 * @desc    Handles various slideshow control actions via Socket.IO events.
 * @access  Public
 */
apiRouter.post('/updateSlideshow', async(req, res, next) => {
    // Destructure the new parameter
    const { action, speed, order, imageUrl, title, description, images, showTextOverlay } = req.body;
    console.log(`➡️ POST /api/updateSlideshow request received`, { action, speed, order, imageUrl, title, description: description !== undefined, imagesCount: images ? images.length : undefined, showTextOverlay });

    try {
        switch (action) {
            case 'next':
            case 'prev':
                console.log(`  - Emitting 'slideAction': ${action}`);
                io.emit('slideAction', { action });
                return res.json({ message: `Navigation action '${action}' broadcasted.` }); // Return early

            case 'updateSettings':
                // Validate the new parameter
                if (typeof speed !== 'number' || speed < 0 || typeof order !== 'string' || typeof showTextOverlay !== 'boolean') {
                    console.warn(`⚠️ /api/updateSlideshow - Invalid payload for 'updateSettings':`, { speed, order, showTextOverlay });
                    return res.status(400).json({ message: 'Invalid payload for updateSettings action (requires valid speed, order, and showTextOverlay boolean).' });
                }
                const settingsPayload = { speed, order, showTextOverlay }; // Include in payload
                console.log(`  - Emitting 'settingsUpdate':`, settingsPayload);
                io.emit('settingsUpdate', settingsPayload);
                return res.json({ message: 'Slideshow settings update broadcasted.' }); // Return early

            case 'play':
                if (!imageUrl || !title || typeof imageUrl !== 'string' || typeof title !== 'string') {
                    console.warn(`⚠️ /api/updateSlideshow - Invalid payload for 'play':`, { imageUrl, title });
                    return res.status(400).json({ message: 'Invalid payload for play action (requires imageUrl and title strings).' });
                }
                const playPayload = { imageUrl, title, description: description || '' };
                console.log(`  - Emitting 'playImage':`, playPayload);
                io.emit('playImage', playPayload);
                return res.json({ message: 'Play specific image broadcasted.' }); // Return early

            case 'playSelect':
                if (!Array.isArray(images) || typeof speed !== 'number' || speed < 0 || typeof order !== 'string') {
                    console.warn(`⚠️ /api/updateSlideshow - Invalid payload for 'playSelect':`, { imagesIsArray: Array.isArray(images), speed, order });
                    return res.status(400).json({ message: 'Invalid payload for playSelect action (requires images array, valid speed, and order).' });
                }

                const MAX_IMAGES_PAYLOAD = 1000; // Adjust limit as needed
                if (images.length > MAX_IMAGES_PAYLOAD) {
                    console.warn(`⚠️ /api/updateSlideshow - Payload too large for 'playSelect': ${images.length} images.`);
                    return res.status(413).json({ message: `Payload too large. Maximum ${MAX_IMAGES_PAYLOAD} images allowed.` });
                }

                console.log('  - Fetching hidden image IDs for filtering...');
                const hiddenTag = await dbGet('SELECT id FROM tags WHERE name = ?', [HIDDEN_TAG_NAME]);
                let hiddenImageIds = new Set();
                if (hiddenTag) {
                    const hiddenImages = await dbAll('SELECT image_id FROM image_tags WHERE tag_id = ?', [hiddenTag.id]);
                    hiddenImageIds = new Set(hiddenImages.map(row => row.image_id));
                    console.log(`    - Found ${hiddenImageIds.size} hidden image IDs.`);
                } else {
                    console.log(`    - '${HIDDEN_TAG_NAME}' tag not found, no images will be filtered out as hidden.`);
                }

                // Filter the provided images list and ensure structure
                const imagesToPlay = images
                    .filter(img => img && typeof img.id !== 'undefined' && !hiddenImageIds.has(img.id))
                    .map(img => ({
                        id: img.id, // Ensure ID is present
                        url: img.url || '', // Ensure URL is string
                        title: img.title || '', // Ensure title is string
                        description: img.description || '' // Ensure description is string
                    }));

                console.log(`  - Filtered list contains ${imagesToPlay.length} images (removed ${images.length - imagesToPlay.length} hidden or invalid).`);

                const playSelectPayload = { images: imagesToPlay, speed, order };
                console.log(`  - Emitting 'playSelect':`, { imagesCount: imagesToPlay.length, speed, order });
                io.emit('playSelect', playSelectPayload);
                return res.json({ message: 'Play selection broadcasted.' }); // Return early

            default:
                console.warn(`⚠️ /api/updateSlideshow - Unknown action: ${action}`);
                return res.status(400).json({ message: `Unknown action: ${action}` });
        }
    } catch (err) {
        console.error(`❌ /api/updateSlideshow - Error processing action '${action}':`, err.message);
        next(err);
    }
});

// Mount the API router
app.use('/api', apiRouter);


// =============================================================================
// Generic Error Handling Middleware
// =============================================================================
/**
 * Centralized error handler.
 * Logs the error and sends a generic 500 response.
 */
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
    console.error("❌ Unhandled Error:", err.stack || err.message || err);
    // Avoid sending detailed error messages in production
    // Consider sending different messages based on error type if needed
    res.status(500).json({ message: 'Internal Server Error' });
});


// =============================================================================
// Server Startup
// =============================================================================
/**
 * Initializes the application: connects to DB, ensures directories, starts server.
 */
async function startApp() {
    try {
        await connectDatabase();
        await initializeSchema(db); // Pass the connected db instance
        await ensureDirectoriesExist([UPLOAD_DIR, THUMBNAIL_DIR]);

        // --- Middleware Setup ---
        app.use(cors()); // Enable CORS
        app.use(express.json()); // Parse JSON bodies
        app.use(express.urlencoded({ extended: true })); // Parse URL-encoded bodies

        // Serve static files from the 'public' directory
        app.use(express.static(PUBLIC_DIR));
        console.log(`  - Serving static files from: ${PUBLIC_DIR}`);

        // NEW: Serve uploads and thumbnails
        app.use('/images', express.static(UPLOAD_DIR));
        console.log(`  - Serving /images path from: ${UPLOAD_DIR}`);
        app.use('/thumbnails', express.static(THUMBNAIL_DIR));
        console.log(`  - Serving /thumbnails path from: ${THUMBNAIL_DIR}`);

        // Mount the API router
        app.use('/api', apiRouter);

        // Start listening only after setup is complete
        server.listen(PORT, () => {
            console.log(`🚀 Server is running at http://localhost:${PORT}`);
            console.log(`📁 Serving static files from: ${PUBLIC_DIR}`);
            console.log(`💾 Database file: ${DB_FILE}`);
        });

        // Socket.IO Connection Handling
        io.on('connection', (socket) => {
            console.log(`🔌 Client connected: ${socket.id}`);

    socket.on('disconnect', (reason) => {
                console.log(`🔌 Client disconnected: ${socket.id}, Reason: ${reason}`);
            });
            socket.on('error', (error) => {
                console.error(`❌ Socket Error (${socket.id}):`, error.message);
            });
            socket.on('connect_error', (error) => {
                console.error(`❌ Socket Connection Error (${socket.id}):`, error.message);
            });
            // Add handlers for specific client-emitted events here if needed later
        });

        // Global Socket.IO engine error handler
        io.engine.on("connection_error", (err) => {
            console.error("❌ Socket Engine Connection Error:", {
                code: err.code,
                message: err.message,
                context: err.context
            });
        });

        // HTTP server error handler
server.on('error', (error) => {
            console.error('❌ HTTP Server Error:', error);
            if (error.syscall !== 'listen') {
                throw error;
            }
            switch (error.code) {
                case 'EACCES':
                    console.error(`Port ${PORT} requires elevated privileges`);
                    process.exit(1);
                    break;
                case 'EADDRINUSE':
                    console.error(`Port ${PORT} is already in use`);
                    process.exit(1);
                    break;
                default:
                    throw error;
            }
        });

    } catch (error) {
        console.error("❌ Failed to start application:", error);
        process.exit(1); // Exit if critical setup fails
    }
}

// Graceful Shutdown Handling
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

function shutdown() {
    console.log('\n🚦 Shutting down gracefully...');
    io.close(() => {
        console.log('🔌 Socket.IO server closed.');
        server.close(() => {
            console.log('✅ HTTP server closed.');
            if (db) {
                db.close((err) => {
                    if (err) {
                        console.error('❌ Error closing database:', err.message);
                    } else {
                        console.log('✅ Database connection closed.');
                    }
                    process.exit(0);
                });
            } else {
                process.exit(0);
            }
        });
    });

    // Force close server after a timeout if needed
    setTimeout(() => {
        console.error('⚠️ Could not close connections in time, forcing shutdown.');
        process.exit(1);
    }, 10000); // 10 seconds timeout
}


// Run the application
startApp();

// =============================================================================
// Helper Function Definitions
// =============================================================================

/**
 * Retrieves the ID of the 'Hidden' tag from the database.
 * @returns {Promise<number|null>} The ID of the hidden tag, or null if not found.
 */
async function getHiddenTagId() {
    try {
        const hiddenTag = await dbGet('SELECT id FROM tags WHERE name = ?', [HIDDEN_TAG_NAME]);
        return hiddenTag ? hiddenTag.id : null;
    } catch (error) {
        console.error('Error fetching hidden tag ID:', error);
        return null; // Return null on error to avoid breaking queries
    }
}

/**
 * Formats a raw image object from the database for API responses.
 * @param {object} img - Raw image object from DB (must have filename, etc.).
 * @returns {object} Formatted image object with full URLs.
 */
function mergeAndFormat(img) {
    if (!img) return null;
    // Construct full URLs (Adjust base URL/path as needed)
    const baseUrl = ''; // Assuming served from root
    return {
        ...img,
        url: `${baseUrl}/images/${img.filename}`, // Changed from /uploads/ to /images/
        thumbnailUrl: `${baseUrl}/thumbnails/${img.filename}`
        // Add tag parsing/formatting here if needed later
    };
}

// --- NEW: Global App Settings (Initialize with defaults) ---
// TODO: Consider loading these from a config file or environment variables
const globalAppSettings = {
    slideshowSpeed: 3,      // Default speed in seconds
    slideshowOrder: 'random' // Default order
};