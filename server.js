const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const sqlite3 = require('sqlite3').verbose();
const sharp = require('sharp'); // NEW: image processing

const app = express();
const PORT = 3000;

// NEW: Disable caching by setting appropriate headers
app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    next();
});

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json()); // to parse JSON bodies

// ---------------------
// Database Setup using SQLite
// ---------------------
const dbFile = path.join(__dirname, 'images.db');
const db = new sqlite3.Database(dbFile, (err) => {
    if (err) console.error('Error opening database:', err);
    else console.log('Database opened successfully.');
});

// Create the images table if it doesn't exist, including dateAdded column
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS images (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        filename TEXT UNIQUE,
        title TEXT,
        description TEXT,  
        tags TEXT,
        dateAdded TEXT
    )`);
    // In case the table already exists from prior runs without the description column,
    // try to add the column. Ignore error if it already exists.
    db.run('ALTER TABLE images ADD COLUMN description TEXT', function(err) {
        if (err && !err.message.includes("duplicate column name: description")) {
            console.error("Error adding column description:", err);
        } else if (!err) {
            console.log("Column 'description' added successfully.");
        }
    });
});

// ---------------------
// NEW: Updated sanitizeFilename with explicit Unicode escapes.
function sanitizeFilename(name) {
    if (!name) return '';
    // Normalize to separate diacritics and remove them.
    let normalized = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const replacements = {
        "'": "\u2019", // smart apostrophe
        "’": "\u2019", // smart apostrophe
        "\"": "\u201D", // smart double quote
        "\\": "-", // backslash
        "/": "-", // forward slash
        ":": "-", // colon
        "*": "-", // asterisk
        "?": "", // remove question mark
        "<": "", // remove less-than
        ">": "", // remove greater-than
        "|": "", // remove pipe
        "ﬀ": "ff", // ligature ff
        "ﬁ": "fi", // ligature fi
        "ﬂ": "fl", // ligature fl
        "ﬃ": "ffi", // ligature ffi
        "ﬄ": "ffl", // ligature ffl
        "æ": "ae", // archaic ae
        "œ": "oe", // archaic oe
        "ß": "ss", // sharp s
        "ð": "d", // eth
        "þ": "th", // thorn
        "ſ": "s" // long s
    };
    let result = "";
    for (const char of normalized) {
        result += (char in replacements) ? replacements[char] : char;
    }
    return result;
}

// ---------------------
// Multer Setup for File Uploads
// ---------------------
const uploadFolder = path.join(__dirname, 'public', 'images');
if (!fs.existsSync(uploadFolder)) {
    fs.mkdirSync(uploadFolder, { recursive: true });
}

// Ensure thumbnails folder exists
const thumbFolder = path.join(__dirname, 'public', 'thumbnails');
if (!fs.existsSync(thumbFolder)) {
    fs.mkdirSync(thumbFolder, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadFolder);
    },
    filename: (req, file, cb) => {
        // Use the sanitized filename for storage
        const safeName = sanitizeFilename(file.originalname);
        cb(null, safeName);
    }
});

const upload = multer({ storage: storage });

// ---------------------
// Upload Endpoint
// ---------------------
app.post('/upload', upload.single('file'), (req, res) => {
    if (!req.file) {
        console.error("No file uploaded in the request.");
        return res.status(400).json({ message: 'No file uploaded.' });
    }

    const overwrite = req.body.overwrite === 'true';
    // Use the sanitized filename as set by multer
    const filename = req.file.filename;
    console.log("Uploaded file:", filename);

    // Strip the file extension from the filename for the title
    const title = path.basename(filename, path.extname(filename));
    const defaultTag = 'All';
    // Use a Unix timestamp for the dateAdded
    const dateAdded = Date.now();

    // Helper: generate thumbnail
    function generateThumbnail(callback) {
        sharp(req.file.path)
            .resize({ width: 200 })
            .toFile(path.join(thumbFolder, filename), (err, info) => {
                if (err) console.error("Error generating thumbnail:", err);
                callback();
            });
    }

    // Check if an entry with this filename already exists
    db.get('SELECT * FROM images WHERE filename = ?', [filename], (err, row) => {
        if (err) {
            console.error("Database error during SELECT:", err);
            return res.status(500).json({ message: 'Database error.' });
        }
        if (row && !overwrite) {
            // File exists and no overwrite flag provided
            fs.unlink(req.file.path, (err) => {
                if (err) console.error("Error deleting duplicate file:", err);
            });
            return res.json({ overwritePrompt: true, message: 'File exists.' });
        } else {
            const runQuery = (query, params, successMsg) => {
                db.run(query, params, function(err) {
                    if (err) {
                        console.error("DB update/insert error:", err);
                        return res.status(500).json({ message: 'Database error.' });
                    }
                    // Generate thumbnail after DB operation
                    generateThumbnail(() => {
                        console.log("Thumbnail created for:", filename);
                        return res.json({ message: `${filename} uploaded successfully.` });
                    });
                });
            };
            if (row && overwrite) {
                runQuery(
                    'UPDATE images SET title = ?, tags = ?, dateAdded = ? WHERE filename = ?', [title, defaultTag, dateAdded, filename],
                    'File overwritten'
                );
            } else {
                runQuery(
                    'INSERT INTO images (filename, title, tags, dateAdded) VALUES (?, ?, ?, ?)', [filename, title, defaultTag, dateAdded],
                    'File inserted'
                );
            }
        }
    });
});

// ---------------------
// API Endpoint to Get Images
// ---------------------
app.get('/api/images', (req, res) => {
    const sql = `
    SELECT images.*, group_concat(tags.name || ':' || tags.color) as tag_list
    FROM images
    LEFT JOIN image_tags ON images.id = image_tags.image_id
    LEFT JOIN tags ON image_tags.tag_id = tags.id
    GROUP BY images.id
  `;
    db.all(sql, (err, rows) => {
        if (err) return res.status(500).json({ message: 'Database error.' });
        const images = rows.map(row => {
            let tags = [];
            if (row.tag_list) {
                tags = row.tag_list.split(',').map(item => {
                    const parts = item.split(':');
                    return {
                        name: parts[0],
                        color: parts[1] ? parts[1] : ''
                    };
                }).filter(t => t.name.trim().toLowerCase() !== 'all');
            }
            return {
                id: row.id,
                title: row.title,
                tags: tags, // Now an array of objects {name, color}
                dateAdded: row.dateAdded,
                url: `/images/${row.filename}`,
                thumbnailUrl: `/thumbnails/${row.filename}` // NEW: thumbnail URL
            };
        });
        res.json(images);
    });
});

// ---------------------
// Delete Single Entry Endpoint
// ---------------------
app.delete('/api/images/:id', (req, res) => {
    const id = req.params.id;
    db.get('SELECT * FROM images WHERE id = ?', [id], (err, row) => {
        if (err) return res.status(500).json({ message: 'Database error.' });
        if (!row) return res.status(404).json({ message: 'Image not found.' });
        const filePath = path.join(uploadFolder, row.filename);
        fs.unlink(filePath, (err) => {
            if (err) console.error('Error deleting file:', err);
            db.run('DELETE FROM images WHERE id = ?', [id], function(err) {
                if (err) return res.status(500).json({ message: 'Database deletion error.' });
                return res.json({ message: `Image ${row.filename} deleted successfully.` });
            });
        });
    });
});

// ---------------------
// Bulk Delete Endpoint
// ---------------------
// Expects JSON: { ids: [1, 2, 3, ...] }
app.delete('/api/images', (req, res) => {
    const ids = req.body.ids;
    if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: 'No ids provided.' });
    }
    db.all(`SELECT * FROM images WHERE id IN (${ids.map(() => '?').join(',')})`, ids, (err, rows) => {
        if (err) return res.status(500).json({ message: 'Database error.' });
        if (!rows || rows.length === 0) return res.status(404).json({ message: 'No images found for deletion.' });

        // Delete each file from disk
        rows.forEach(row => {
            const filePath = path.join(uploadFolder, row.filename);
            fs.unlink(filePath, (err) => {
                if (err) console.error('Error deleting file:', err);
            });
        });

        // Delete records from database
        db.run(`DELETE FROM images WHERE id IN (${ids.map(() => '?').join(',')})`, ids, function(err) {
            if (err) return res.status(500).json({ message: 'Database deletion error.' });
            return res.json({ message: `${rows.length} images deleted successfully.` });
        });
    });
});

// ---------------------
// DATABASE: Create Tables for Tag Management
// ---------------------
db.serialize(() => {
    // Create the tags table if it doesn't exist
    db.run(`CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE,
    color TEXT
  )`);

    // Create the image_tags table to associate images with tags
    db.run(`CREATE TABLE IF NOT EXISTS image_tags (
    image_id INTEGER,
    tag_id INTEGER,
    PRIMARY KEY (image_id, tag_id),
    FOREIGN KEY (image_id) REFERENCES images(id),
    FOREIGN KEY (tag_id) REFERENCES tags(id)
  )`);
});

// ---------------------
// GET ALL TAGS
// ---------------------
app.get('/api/tags', (req, res) => {
    db.all('SELECT * FROM tags', (err, rows) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ message: 'Error fetching tags.' });
        }
        res.json(rows);
    });
});

// ---------------------
// CREATE A NEW TAG
// ---------------------
app.post('/api/tags', (req, res) => {
    const { name, color } = req.body;
    if (!name) {
        return res.status(400).json({ message: 'Tag name is required.' });
    }
    db.run('INSERT INTO tags (name, color) VALUES (?, ?)', [name, color || '#FF4081'], function(err) {
        if (err) {
            console.error(err);
            return res.status(500).json({ message: 'Error creating tag.' });
        }
        res.json({ message: `Tag "${name}" created successfully.`, id: this.lastID });
    });
});

// ---------------------
// DELETE A TAG (and remove its associations)
// ---------------------
app.delete('/api/tags/:id', (req, res) => {
    const tagId = req.params.id;
    // First remove associations
    db.run('DELETE FROM image_tags WHERE tag_id = ?', [tagId], (err) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ message: 'Error removing tag associations.' });
        }
        // Then delete the tag
        db.run('DELETE FROM tags WHERE id = ?', [tagId], function(err) {
            if (err) {
                console.error(err);
                return res.status(500).json({ message: 'Error deleting tag.' });
            }
            res.json({ message: 'Tag deleted successfully.' });
        });
    });
});

// ---------------------
// BULK ADD A TAG TO MULTIPLE ENTRIES
// ---------------------
app.post('/api/entries/tags', (req, res) => {
    const { ids, tag } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0 || !tag) {
        return res.status(400).json({ message: 'Invalid request.' });
    }
    // Find the tag id from its name
    db.get('SELECT id FROM tags WHERE name = ?', [tag], (err, row) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ message: 'Error looking up tag.' });
        }
        if (!row) {
            return res.status(404).json({ message: `Tag "${tag}" not found.` });
        }
        const tagId = row.id;
        const stmt = db.prepare('INSERT OR IGNORE INTO image_tags (image_id, tag_id) VALUES (?, ?)');
        ids.forEach(imageId => {
            stmt.run(imageId, tagId);
        });
        stmt.finalize(err => {
            if (err) {
                console.error(err);
                return res.status(500).json({ message: 'Error adding tag to entries.' });
            }
            res.json({ message: `Tag "${tag}" added to selected entries.` });
        });
    });
});

// ---------------------
// BULK REMOVE A TAG FROM MULTIPLE ENTRIES
// ---------------------
app.delete('/api/entries/tags', (req, res) => {
    const { ids, tag } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0 || !tag) {
        return res.status(400).json({ message: 'Invalid request.' });
    }
    db.get('SELECT id FROM tags WHERE name = ?', [tag], (err, row) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ message: 'Error looking up tag.' });
        }
        if (!row) {
            return res.status(404).json({ message: `Tag "${tag}" not found.` });
        }
        const tagId = row.id;
        const placeholders = ids.map(() => '?').join(',');
        db.run(`DELETE FROM image_tags WHERE tag_id = ? AND image_id IN (${placeholders})`, [tagId, ...ids], function(err) {
            if (err) {
                console.error(err);
                return res.status(500).json({ message: 'Error removing tag from entries.' });
            }
            res.json({ message: `Tag "${tag}" removed from selected entries.` });
        });
    });
});

// ---------------------
// Endpoint to Update Slideshow Settings or Play Specific Image
// ---------------------
app.post('/api/updateSlideshow', (req, res) => {
    const { action, speed, order, imageUrl, title, images } = req.body;
    if (action === 'updateSettings') {
        // Broadcast settings update to all clients
        io.emit('settingsUpdate', { speed, order });
    } else if (action === 'play') {
        // Broadcast play specific image to all clients
        io.emit('playImage', { imageUrl, title });
    } else if (action === 'playSelect') {
        // Broadcast the selected images to all clients
        io.emit('playSelect', { images });
    }
    res.json({ message: 'Slideshow updated.' });
});

// NEW: Endpoint to update image title and description (without modifying the filename)
app.put('/api/images/:id', (req, res) => {
    const id = parseInt(req.params.id, 10); // ensure id is numeric
    const { title, description } = req.body;
    console.log("Updating image", id, "with title:", title, "and description:", description);
    db.run('UPDATE images SET title = ?, description = ? WHERE id = ?', [title, description || '', id], function(err) {
        if (err) {
            console.error("Error updating image:", err);
            return res.status(500).json({ message: 'Database update error.' });
        }
        if (this.changes === 0) {
            return res.status(404).json({ message: 'Image not found.' });
        }
        res.json({ message: 'Image updated successfully.' });
    });
});

// ---------------------
// Start the Server with Socket.io
// ---------------------
const server = app.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
});

const io = require('socket.io')(server);