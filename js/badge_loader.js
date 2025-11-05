/**
 * Dynamic Badge Loader with Staleness Detection
 * 
 * This script loads Jenkins build status badges from static files synced by cron,
 * but checks if they're stale and displays an "Out-of-sync" badge if needed.
 * - Main branch badges: considered stale after 7 days
 * - Devel branch badges: considered stale after 1 day
 * - Nightly benchmark badges: considered stale after 1 day
 */

// Configuration for staleness thresholds (in milliseconds)
const STALENESS_CONFIG = {
    'main': 7 * 24 * 60 * 60 * 1000,  // 7 days
    'devel': 1 * 24 * 60 * 60 * 1000,  // 1 day
    'nightly': 1 * 24 * 60 * 60 * 1000  // 1 day
};

/**
 * Create an out-of-sync SVG badge
 * @param {string} label - The label for the badge (e.g., "GCC (main)")
 * @returns {string} - Data URL of an out-of-sync badge
 */
function createOutOfSyncBadge(label) {
    // Truncate label if too long
    const displayLabel = label.length > 20 ? label.substring(0, 18) + '...' : label;
    const labelWidth = Math.max(50, displayLabel.length * 7);
    const statusWidth = 80;
    const totalWidth = labelWidth + statusWidth;
    
    const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="20">
            <linearGradient id="b" x2="0" y2="100%">
                <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
                <stop offset="1" stop-opacity=".1"/>
            </linearGradient>
            <clipPath id="a">
                <rect width="${totalWidth}" height="20" rx="3" fill="#fff"/>
            </clipPath>
            <g clip-path="url(#a)">
                <path fill="#555" d="M0 0h${labelWidth}v20H0z"/>
                <path fill="#e05d44" d="M${labelWidth} 0h${statusWidth}v20H${labelWidth}z"/>
                <path fill="url(#b)" d="M0 0h${totalWidth}v20H0z"/>
            </g>
            <g fill="#fff" text-anchor="middle" font-family="DejaVu Sans,Verdana,Geneva,sans-serif" font-size="11">
                <text x="${labelWidth / 2}" y="15" fill="#010101" fill-opacity=".3">${displayLabel}</text>
                <text x="${labelWidth / 2}" y="14">${displayLabel}</text>
                <text x="${labelWidth + statusWidth / 2}" y="15" fill="#010101" fill-opacity=".3">Out-of-sync</text>
                <text x="${labelWidth + statusWidth / 2}" y="14">Out-of-sync</text>
            </g>
        </svg>
    `.trim();
    
    return 'data:image/svg+xml;base64,' + btoa(svg);
}

/**
 * Create a simple SVG error badge as a data URL
 * @returns {string} - Data URL of an error badge
 */
function createErrorBadge() {
    const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="120" height="20">
            <rect width="120" height="20" fill="#555"/>
            <rect x="60" width="60" height="20" fill="#9f9f9f"/>
            <text x="30" y="14" fill="#fff" font-family="DejaVu Sans,Verdana,Geneva,sans-serif" font-size="11" text-anchor="middle">Status</text>
            <text x="90" y="14" fill="#fff" font-family="DejaVu Sans,Verdana,Geneva,sans-serif" font-size="11" text-anchor="middle">Unknown</text>
        </svg>
    `;
    return 'data:image/svg+xml;base64,' + btoa(svg);
}

/**
 * Fetch the last sync timestamp
 * @returns {Promise<number|null>} - Unix timestamp in milliseconds, or null if unavailable
 */
async function fetchLastSyncTimestamp() {
    try {
        const response = await fetch('badges/last_sync.json', { cache: 'no-cache' });
        if (!response.ok) {
            console.warn('Could not fetch last_sync.json');
            return null;
        }
        const data = await response.json();
        return data.unix_timestamp * 1000; // Convert to milliseconds
    } catch (error) {
        console.error('Error fetching sync timestamp:', error);
        return null;
    }
}

/**
 * Determine badge type from badge filename
 * @param {string} badgeSrc - Badge source path
 * @returns {string} - 'main', 'devel', or 'nightly'
 */
function getBadgeType(badgeSrc) {
    if (badgeSrc.includes('_main.svg')) return 'main';
    if (badgeSrc.includes('_devel.svg')) return 'devel';
    if (badgeSrc.includes('nightly')) return 'nightly';
    return 'main'; // Default to main's longer threshold
}

/**
 * Extract a readable label from the badge alt text or filename
 * @param {HTMLImageElement} img - The image element
 * @returns {string} - A readable label
 */
function getBadgeLabel(img) {
    return img.alt || img.src.split('/').pop().replace('.svg', '').replace(/_/g, ' ');
}

/**
 * Check if badges are stale and update images accordingly
 * @param {number|null} lastSyncTime - Unix timestamp of last sync in milliseconds
 */
async function checkAndUpdateBadges(lastSyncTime) {
    const badgeImages = document.querySelectorAll('img[src^="badges/"]');
    const currentTime = Date.now();
    
    if (lastSyncTime === null) {
        console.warn('No sync timestamp available, showing error badges');
        badgeImages.forEach(img => {
            img.src = createErrorBadge();
        });
        return;
    }
    
    const ageMs = currentTime - lastSyncTime;
    const ageDays = Math.floor(ageMs / (24 * 60 * 60 * 1000));
    console.log(`Badge age: ${ageDays} days`);
    
    badgeImages.forEach(img => {
        const badgeType = getBadgeType(img.src);
        const stalenessThreshold = STALENESS_CONFIG[badgeType];
        
        if (ageMs > stalenessThreshold) {
            const label = getBadgeLabel(img);
            console.log(`Badge is stale: ${label} (${badgeType}, age: ${ageDays} days)`);
            img.src = createOutOfSyncBadge(label);
            img.title = `Last updated: ${Math.floor(ageMs / (24 * 60 * 60 * 1000))} days ago`;
        } else {
            console.log(`Badge is fresh: ${img.alt} (${badgeType})`);
            // Add a cache-busting parameter to ensure fresh load
            const originalSrc = img.src.split('?')[0];
            img.src = `${originalSrc}?t=${lastSyncTime}`;
        }
    });
}

/**
 * Load all badges with staleness checking
 */
async function loadAllBadges() {
    console.log('Loading Jenkins badges with staleness detection...');
    
    const lastSyncTime = await fetchLastSyncTimestamp();
    
    if (lastSyncTime) {
        const syncDate = new Date(lastSyncTime);
        console.log(`Last badge sync: ${syncDate.toISOString()}`);
    }
    
    await checkAndUpdateBadges(lastSyncTime);
    console.log('Badge loading complete');
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadAllBadges);
} else {
    loadAllBadges();
}
