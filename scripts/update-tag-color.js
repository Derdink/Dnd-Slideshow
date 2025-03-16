const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./images.db');

// Define the list of colors
const colors = [
    "#e0e0e0", "#dde1e6", "#e5e0df", "#ffd7d9", "#ffd6e8", "#e8daff",
    "#d0e2ff", "#bae6ff", "#9ef0f0", "#a7f0ba", "#FFD8BD", "#ffeeb1", "#D5FFBD"
];

// Function to shuffle an array
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

// Fetch all tags from the database
db.all(`SELECT id FROM tags`, [], (err, rows) => {
    if (err) {
        throw err;
    }

    const tagIds = rows.map(row => row.id);
    const totalTags = tagIds.length;
    const colorsPerTag = Math.floor(totalTags / colors.length);
    const remainingTags = totalTags % colors.length;

    // Create an array with the correct number of each color
    let colorAssignments = [];
    colors.forEach(color => {
        for (let i = 0; i < colorsPerTag; i++) {
            colorAssignments.push(color);
        }
    });

    // Add remaining colors
    for (let i = 0; i < remainingTags; i++) {
        colorAssignments.push(colors[i]);
    }

    // Shuffle the color assignments
    shuffleArray(colorAssignments);

    // Update each tag with a new color
    tagIds.forEach((id, index) => {
        const color = colorAssignments[index];
        db.run(`UPDATE tags SET color = ? WHERE id = ?`, [color, id], function(err) {
            if (err) {
                console.error(`Error updating tag ${id}:`, err.message);
            } else {
                console.log(`Tag ${id} updated with color ${color}`);
            }
        });
    });

    db.close();
});