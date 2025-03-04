/*
  This script processes all images in the public/images folder and generates a 100px-wide thumbnail.
  Thumbnails are saved in the separate folder "public/thumbnails".
  
  Run it from the project root:
     node scripts/generate-thumbnails.js
*/

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const imagesDir = path.join(__dirname, '..', 'public', 'images');
// NEW: Define a separate folder for thumbnails.
const thumbsDir = path.join(__dirname, '..', 'public', 'thumbnails');

if (!fs.existsSync(thumbsDir)) {
    fs.mkdirSync(thumbsDir, { recursive: true });
}

fs.readdir(imagesDir, (err, files) => {
    if (err) {
        console.error('Error reading images directory:', err);
        process.exit(1);
    }
    const imageFiles = files.filter(file => /\.(jpe?g|png|gif|webp)$/i.test(file));
    if (imageFiles.length === 0) {
        console.log('No image files found in public/images.');
        process.exit(0);
    }
    imageFiles.forEach(file => {
        const imagePath = path.join(imagesDir, file);
        const thumbPath = path.join(thumbsDir, file); // Save thumbnail in separate folder.
        sharp(imagePath)
            .resize({ width: 100 })
            .toFile(thumbPath, (err, info) => {
                if (err) {
                    console.error(`Error generating thumbnail for ${file}:`, err);
                } else {
                    console.log(`Thumbnail generated for ${file}`);
                }
            });
    });
});