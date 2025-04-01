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
        "’": "\u2019", // Keep right single quotation mark
        "\"": "\u201D", // Replace standard double quote with right double quotation mark
        "“": "\u201C", // Keep left double quotation mark
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
        "ﬀ": "ff",
        "ﬁ": "fi",
        "ﬂ": "fl",
        "ﬃ": "ffi",
        "ﬄ": "ffl",
        // Archaic letters / special characters
        "æ": "ae",
        "œ": "oe",
        "ß": "ss",
        "ð": "d",
        "þ": "th",
        "ſ": "s"
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
    const filename = req.file.filename; // Sanitized filename from multer
    const originalPath = req.file.path;
    const thumbPath = path.join(THUMBNAIL_DIR, filename);
    const title = path.basename(filename, path.extname(filename)); // Title from sanitized name
    const dateAdded = Date.now().toString();

    console.log(`➡️ POST /upload request received for file: ${filename}`, { overwrite });

    try {
    // Check if an entry with this filename already exists
        const existingImage = await dbGet('SELECT id FROM images WHERE filename = ?', [filename]);

        if (existingImage && !overwrite) {
            console.log(`  - File "${filename}" exists, overwrite not requested. Prompting client.`);
            // Clean up the uploaded file as it's a duplicate not being overwritten
            try {
                await fs.unlink(originalPath);
                console.log(`    - Deleted temporary duplicate file: ${originalPath}`);
            } catch (unlinkErr) {
                if (unlinkErr.code !== 'ENOENT') {
                    console.warn(`    ⚠️ Could not delete temporary duplicate file ${originalPath}:`, unlinkErr.message);
                }
            }
            return res.json({ overwritePrompt: true, message: `File '${filename}' already exists.` });
        }

        // Proceed with insert or update
        if (existingImage && overwrite) {
            // --- Overwrite existing entry ---
            console.log(`  - File "${filename}" exists, overwriting.`);
            const result = await dbRun(
                'UPDATE images SET title = ?, dateAdded = ?, description = ?' +
                ' WHERE filename = ?', [title, dateAdded, '', filename] // Parameters as a separate argument
            );
            if (result.changes === 0) {
                console.warn(`  ⚠️ Overwrite failed: Image "${filename}" not found in DB during UPDATE.`);
                throw new Error('Database update failed during overwrite.');
            }
            console.log(`    - Database record updated for "${filename}".`);

            await generateThumbnail(originalPath, thumbPath, filename);
            console.log(`✅ POST /upload - File "${filename}" overwritten successfully.`);
            res.json({ message: `File '${filename}' overwritten successfully.` });

            } else {
            // --- Insert new entry ---
            console.log(`  - File "${filename}" is new, inserting record.`);
            const insertResult = await dbRun(
                'INSERT INTO images (filename, title, description, dateAdded) VALUES (?, ?, ?, ?)', [filename, title, '', dateAdded] // Insert with empty description
            );
            const newImageId = insertResult.lastID;
            console.log(`    - Database record inserted for "${filename}" with ID: ${newImageId}.`);

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
                // Decide if this error should cause the whole upload to fail
            }

            await generateThumbnail(originalPath, thumbPath, filename);
            console.log(`✅ POST /upload - File "${filename}" uploaded successfully.`);
            res.status(201).json({ message: `File '${filename}' uploaded successfully.`, imageId: newImageId });
        }

    } catch (err) {
        console.error(`❌ POST /upload - Error processing upload for "${filename}":`, err);
        // Attempt to clean up the uploaded file if an error occurred during DB operations
        try {
            await fs.unlink(originalPath);
            console.log(`    - Cleaned up temporary file after error: ${originalPath}`);
        } catch (cleanupErr) {
            if (cleanupErr.code !== 'ENOENT') {
                console.warn(`    ⚠️ Could not cleanup file ${originalPath} after error:`, cleanupErr.message);
            }
        }
        next(err); // Pass to the main error handler
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
 * @desc    Get images with filtering, sorting, and pagination
 * @access  Public
 * @query   {string} [search] - Text to search in title/description.
 * @query   {string} [tags] - Comma-separated list of tag names to filter by (AND logic).
 * @query   {number} [playlistId] - ID of the playlist to filter by.
 * @query   {boolean} [includeHidden=false] - Whether to include images tagged as 'Hidden'.
 * @query   {string} [sortKey=dateAdded] - Field to sort by (id, filename, title, description, dateAdded).
 * @query   {string} [sortDir=desc] - Sort direction ('asc' or 'desc').
 * @query   {number} [page=1] - Page number for pagination.
 * @query   {number} [limit=20] - Number of items per page.
 */
apiRouter.get('/images', async (req, res, next) => {
    console.log("➡️ GET /api/images request received with query:", req.query);
    try {
        const { search, tags, playlistId, includeHidden, sortKey, sortDir, page, limit } = req.query;

        // --- Parameter Validation & Defaults ---
        const currentPage = parseInt(page, 10) || 1;
        const itemsPerPage = parseInt(limit, 10) || 20;
        const offset = (currentPage - 1) * itemsPerPage;
        const searchTerm = search ? `%${search.trim().toLowerCase()}%` : null;
        const filterTags = tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : [];
        const filterPlaylistId = playlistId ? parseInt(playlistId, 10) : null;
        const filterIds = req.query.ids ? req.query.ids.split(',').map(id => parseInt(id.trim(), 10)).filter(id => !isNaN(id)) : [];
        const shouldIncludeHidden = includeHidden === 'true';

        const validSortKeys = ['id', 'filename', 'title', 'description', 'dateAdded'];
        const sortColumn = validSortKeys.includes(sortKey) ? sortKey : 'dateAdded';
        const sortDirection = sortDir?.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

        // --- Base SQL Query Parts ---
        let baseSelect = `
            SELECT
                i.id, i.filename, i.title, i.description, i.dateAdded,
                GROUP_CONCAT(DISTINCT CASE WHEN t.id IS NOT NULL THEN t.id || ':::' || t.name || ':::' || t.color ELSE NULL END) as tag_data
        `;
        let countSelect = `SELECT COUNT(DISTINCT i.id)`;
        let fromClause = `FROM images i`;
        let whereClauses = [];
        let joinClauses = [];
        let params = [];

        // --- Dynamic WHERE Clause Construction ---

        // ADDED: Filter by specific IDs if provided (primary filter)
        if (filterIds.length > 0) {
            const placeholders = filterIds.map(() => '?').join(',');
            whereClauses.push(`i.id IN (${placeholders})`);
            params.push(...filterIds);
            console.log(`  - Filtering by specific IDs: ${filterIds.join(', ')}`);
        } else {
          // Only apply other filters if not filtering by specific IDs
          if (searchTerm) {
              whereClauses.push(`(LOWER(i.title) LIKE ? OR LOWER(i.description) LIKE ?)`);
              params.push(searchTerm, searchTerm);
          }

          // Join tags only if filtering by tags or needing to exclude/include hidden
          if (filterTags.length > 0 || !shouldIncludeHidden) {
              joinClauses.push(`LEFT JOIN image_tags it_filter ON i.id = it_filter.image_id`);
              joinClauses.push(`LEFT JOIN tags t_filter ON it_filter.tag_id = t_filter.id`);
          }

          // Filter by Specific Tags (AND logic)
          if (filterTags.length > 0) {
              filterTags.forEach((tagName, index) => {
                  whereClauses.push(`
                      EXISTS (
                          SELECT 1 FROM image_tags it_sub_${index}
                          JOIN tags t_sub_${index} ON it_sub_${index}.tag_id = t_sub_${index}.id
                          WHERE it_sub_${index}.image_id = i.id AND LOWER(t_sub_${index}.name) = LOWER(?)
                      )
                  `);
                  params.push(tagName);
              });
          }

          // Filter by Playlist
          if (filterPlaylistId && !isNaN(filterPlaylistId)) {
              joinClauses.push(`INNER JOIN playlist_images pi ON i.id = pi.image_id`);
              whereClauses.push(`pi.playlist_id = ?`);
              params.push(filterPlaylistId);
          }

          // Handle Hidden Tag Exclusion (unless explicitly requested)
          if (!shouldIncludeHidden) {
              whereClauses.push(`
                  NOT EXISTS (
                      SELECT 1 FROM image_tags it_hidden
                      JOIN tags t_hidden ON it_hidden.tag_id = t_hidden.id
                      WHERE it_hidden.image_id = i.id AND LOWER(t_hidden.name) = LOWER(?)
                  )
              `);
              params.push(HIDDEN_TAG_NAME);
          }
        }

        // Always join tags for the main SELECT to get tag data
        // Use different aliases to avoid conflicts with filter joins
        joinClauses.push(`LEFT JOIN image_tags it ON i.id = it.image_id`);
        joinClauses.push(`LEFT JOIN tags t ON it.tag_id = t.id`);

        // --- Assemble WHERE Clause ---
        let whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
        // Ensure joins are unique
        const uniqueJoinClauses = [...new Set(joinClauses)];
        let joinSql = uniqueJoinClauses.join(' ');

        // --- Construct Count Query (Only needed if NOT filtering by ID) ---
        let totalItems = 0;
        let totalPages = 1;
        let finalCurrentPage = 1;
        let finalOffset = 0;

        if (filterIds.length > 0) {
            // If filtering by IDs, pagination might not make sense or totalItems is just the count of valid IDs found
            totalItems = filterIds.length; // Assume all requested IDs are potentially valid items
            totalPages = 1; // Typically show all results when filtering by specific IDs
            finalCurrentPage = 1;
            finalOffset = 0;
             console.log(`  - Skipping count query because filtering by specific IDs. Total assumed: ${totalItems}`);
        } else {
            // Perform count query only when not filtering by specific IDs
            const countSql = `${countSelect} ${fromClause} ${joinSql} ${whereSql}`;
            console.log("Count SQL:", countSql, params);
            const totalItemsResult = await dbGet(countSql, params);
            totalItems = totalItemsResult ? totalItemsResult['COUNT(DISTINCT i.id)'] : 0;
            totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
            // Adjust currentPage if it exceeds totalPages after filtering
            finalCurrentPage = Math.min(currentPage, totalPages);
            finalOffset = (finalCurrentPage - 1) * itemsPerPage;
             console.log(`  - Count query executed. Total items: ${totalItems}, Total pages: ${totalPages}`);
        }


        // --- Construct Main Query ---
        let mainSql = `
            ${baseSelect}
            ${fromClause}
            ${joinSql}
            ${whereSql}
            GROUP BY i.id
            ORDER BY ${sortColumn} ${sortDirection}
        `;
        let mainParams = [...params];

        // Add LIMIT/OFFSET only if not filtering by ID (or decide if you want pagination even with ID filter)
        if (filterIds.length === 0) {
             mainSql += ` LIMIT ? OFFSET ?`;
             mainParams.push(itemsPerPage, finalOffset);
        }

        console.log("Main SQL:", mainSql, mainParams);
        const rows = await dbAll(mainSql, mainParams);

        if (!rows) {
            console.warn("⚠️ GET /api/images - Main query returned null/undefined rows object.");
            return res.json({ images: [], pagination: { currentPage: 1, totalPages: 1, totalItems: 0 } });
        }

        // --- Process Results --- 
        const images = rows.map(row => {
            let tagObjects = [];
            if (row.tag_data) {
                // Use Set to ensure uniqueness after splitting, just in case DISTINCT failed
                const uniqueTagStrings = new Set(row.tag_data.split(',')); 
                tagObjects = Array.from(uniqueTagStrings) // Convert Set back to array
                    .map(item => {
                        if (!item) return null;
                        const parts = item.split(':::');
                        if (parts.length === 3 && parts[1]) { // Need ID, Name, Color
                            return {
                                id: parseInt(parts[0], 10),
                                name: parts[1],
                                color: parts[2] || DEFAULT_COLOR
                            };
                        }
                        return null;
                    })
                    .filter(t => t && t.name && t.name.trim().toLowerCase() !== 'all'); // Filter out nulls and legacy 'all' tag
            }
            return {
                id: row.id,
                title: row.title,
                description: row.description || '',
                tags: tagObjects, // Return full tag objects
                tagIds: tagObjects.map(t => t.id), // Include tag IDs for easier client-side filtering if needed
                dateAdded: row.dateAdded,
                url: `/images/${encodeURIComponent(row.filename)}`,
                thumbnailUrl: `/thumbnails/${encodeURIComponent(row.filename)}`
            };
        });

        const pagination = {
            currentPage: finalCurrentPage,
            totalPages: totalPages,
            totalItems: totalItems,
            itemsPerPage: itemsPerPage
        };

        console.log(`✅ GET /api/images - Responding with ${images.length} images (Page ${finalCurrentPage}/${totalPages}, Total ${totalItems}).`);
        res.json({ images, pagination });

    } catch (err) {
        console.error("❌ GET /api/images - Error processing request:", err.message, err.stack);
        next(err);
    }
});

/**
 * @route   PUT /api/images/:id
 * @desc    Update an image's title and description
 * @access  Public
 * @param   {number} id - The ID of the image to update.
 * @body    {string} title - The new title for the image.
 * @body    {string} [description] - The new description for the image.
 */
apiRouter.put('/images/:id', async(req, res, next) => {
    const imageId = parseInt(req.params.id, 10);
    console.log(`➡️ PUT /api/images/${imageId} request received`, { title, hasDescription: req.body.description !== undefined });

    if (isNaN(imageId)) {
        console.warn(`⚠️ PUT /api/images/:id - Invalid ID format: ${req.params.id}`);
        return res.status(400).json({ message: 'Invalid image ID format.' });
    }
    if (!req.body.title || typeof req.body.title !== 'string' || req.body.title.trim().length === 0) {
        console.warn(`⚠️ PUT /api/images/${imageId} - Missing or invalid title.`);
        return res.status(400).json({ message: 'Image title is required and must be a non-empty string.' });
    }
    const trimmedTitle = req.body.title.trim();
    const finalDescription = req.body.description || ''; // Ensure description is at least empty string

    try {
        const result = await dbRun(
            'UPDATE images SET title = ?, description = ? WHERE id = ?', [trimmedTitle, finalDescription, imageId]
        );

        if (result.changes === 0) {
            console.warn(`⚠️ PUT /api/images/${imageId} - Image not found.`);
            return res.status(404).json({ message: 'Image not found.' });
        }

        console.log(`✅ PUT /api/images/${imageId} - Image updated successfully.`);
        res.json({ message: 'Image updated successfully.' });

    } catch (err) {
        console.error(`❌ PUT /api/images/${imageId} - Error updating image:`, err.message);
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
 * @desc    Get all tags, ordered by name.
 * @access  Public
 */
apiRouter.get('/tags', async(req, res, next) => {
    console.log("➡️ GET /api/tags request received");
    try {
        const tags = await dbAll('SELECT * FROM tags ORDER BY name');
        console.log(`✅ GET /api/tags - Responding with ${tags.length} tags.`);
        res.json(tags.map(tag => ({...tag, color: tag.color || DEFAULT_COLOR }))); // Ensure default color
    } catch (err) {
        console.error("❌ GET /api/tags - Error fetching tags:", err.message);
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
apiRouter.post('/playlists', async(req, res, next) => {
    const playlists = req.body.playlists;
    console.log(`➡️ POST /api/playlists (Bulk Save) request received`);

    if (!Array.isArray(playlists)) {
        console.warn("⚠️ POST /api/playlists - Invalid payload: 'playlists' must be an array.");
        return res.status(400).json({ message: 'Invalid playlists data: Body must contain a \'playlists\' array.' });
    }

    // Basic validation of playlist structure
    const isValid = playlists.every(p =>
        p &&
        typeof p.name === 'string' && p.name.trim().length > 0 &&
        Array.isArray(p.imageIds) &&
        p.imageIds.every(id => typeof id === 'number' && !isNaN(id)) &&
        (p.id === undefined || (typeof p.id === 'number' && !isNaN(p.id))) // ID should be number or undefined
    );
    if (!isValid) {
        console.warn("⚠️ POST /api/playlists - Invalid playlist structure in array.");
        return res.status(400).json({ message: 'Invalid playlist structure in the provided array.' });
    }

    console.log(`  - Attempting to save/replace ${playlists.length} playlists.`);

    db.serialize(async() => {
        try {
            await dbRun('BEGIN TRANSACTION');

            await dbRun('DELETE FROM playlist_images');
            await dbRun('DELETE FROM playlists');
            console.log('  - Cleared existing playlist data.');

            const playlistInsertSql = 'INSERT INTO playlists (id, name, color, is_hidden, created_at) VALUES (?, ?, ?, ?, ?)';
            const imageInsertSql = 'INSERT INTO playlist_images (playlist_id, image_id) VALUES (?, ?)';

            let insertedPlaylists = 0;
            let insertedAssociations = 0;

            for (const playlist of playlists) {
                const playlistId = playlist.id || Date.now() + Math.random(); // More robust temporary ID if needed
                const createdAt = playlist.createdAt || new Date().toISOString();
                const color = playlist.color || DEFAULT_COLOR;
                const name = playlist.name.trim();
                const isHidden = playlist.hidden ? 1 : 0;

                await dbRun(playlistInsertSql, [
                    playlistId,
                    name,
                    color,
                    isHidden,
                    createdAt
                ]);
                insertedPlaylists++;

                for (const imageId of playlist.imageIds) {
                    // Optional: Check if imageId exists in images table?
                    // const imageExists = await dbGet('SELECT 1 FROM images WHERE id = ?', [imageId]);
                    // if (imageExists) {
                    await dbRun(imageInsertSql, [playlistId, imageId]);
                    insertedAssociations++;
                    // }
                }
            }

            await dbRun('COMMIT');
            console.log(`✅ POST /api/playlists - Saved ${insertedPlaylists} playlists and ${insertedAssociations} image associations.`);
        res.json({ message: 'Playlists saved successfully.' });

        } catch (err) {
            console.error("❌ POST /api/playlists - Transaction error during bulk save:", err.message);
            try {
                await dbRun('ROLLBACK');
                console.log("  - Transaction rolled back due to error.");
            } catch (rollbackErr) {
                console.error("  - Failed to rollback transaction:", rollbackErr.message);
            }
            // Handle specific errors like UNIQUE constraint violation
            if (err.message && err.message.includes('UNIQUE constraint failed')) {
                return res.status(409).json({ message: 'Playlist name conflict during save.' });
            }
            next(err);
        }
    });
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
    const { action, speed, order, imageUrl, title, description, images } = req.body;
    console.log(`➡️ POST /api/updateSlideshow request received`, { action, speed, order, imageUrl, title, description: description !== undefined, imagesCount: images ? images.length : undefined });

    try {
        switch (action) {
            case 'next':
            case 'prev':
                console.log(`  - Emitting 'slideAction': ${action}`);
                io.emit('slideAction', { action });
                return res.json({ message: `Navigation action '${action}' broadcasted.` }); // Return early

            case 'updateSettings':
                if (typeof speed !== 'number' || speed < 0 || typeof order !== 'string') {
                    console.warn(`⚠️ /api/updateSlideshow - Invalid payload for 'updateSettings':`, { speed, order });
                    return res.status(400).json({ message: 'Invalid payload for updateSettings action (requires valid speed and order).' });
                }
                console.log(`  - Emitting 'settingsUpdate':`, { speed, order });
                io.emit('settingsUpdate', { speed, order });
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