# SPECFEM++ Review Dashboard

A minimal, responsive dashboard for monitoring SPECFEM++ CI/CD status and pull requests.

## Setup

### 1. Create Configuration File

Create a file named `token.js` in this directory with the following content:

```javascript
const TOKEN = {
    GITHUB_TOKEN: '' // Add your GitHub token here (optional but recommended)
};
```

**Note:** `token.js` is not tracked in git to keep your token private.

### 2. Add GitHub Personal Access Token (Optional but Recommended)

Adding a token increases the API rate limit from 60 to 5,000 requests per hour.

#### How to Create a GitHub Personal Access Token:

1. **Go to GitHub Settings**:
   - Click your profile picture (top right) → Settings
   - OR visit: https://github.com/settings/tokens

2. **Navigate to Personal Access Tokens**:
   - Scroll down to "Developer settings" (left sidebar)
   - Click "Personal access tokens" → "Tokens (classic)"
   - Click "Generate new token" → "Generate new token (classic)"

3. **Configure the token**:
   - **Note**: Give it a name like "SPECFEMPP Review Dashboard"
   - **Expiration**: Choose duration (30 days, 90 days, or no expiration)
   - **Scopes**: Select these permissions:
     - ✅ `repo:status` - Access commit status
     - ✅ `public_repo` - Access public repositories
     - OR ✅ `repo` (full) - If the repository is private

4. **Generate and copy**:
   - Click "Generate token" at the bottom
   - **⚠️ COPY THE TOKEN IMMEDIATELY** (you won't see it again!)
   - It will look like: `ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxx`

5. **Add to config.js**:
   ```javascript
   const CONFIG = {
       GITHUB_TOKEN: 'ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxx'
   };
   ```

### 3. Update Repository (if needed)

If monitoring a different repository, edit `script.js`:

```javascript
const GITHUB_REPO = 'PrincetonUniversity/SPECFEMPP'; // Change to 'owner/repo'
```

## Features

- **Nightly Benchmark Plots**: Interactive Plotly.js charts with date range sliders showing execution time by region
- **CI Status Badges**: Real-time Jenkins build status for main and devel branches
- **Pull Request Matrix**: Interactive table showing all open PRs with CI check status
  - GitHub Actions checks (🔵)
  - External checks like Jenkins (🟣)
  - Color-coded status: ✓ success, ✗ failure, ⋯ pending, — not run
  - Fixed PR title column for easy scrolling

## Benchmark Plots Setup

The dashboard displays interactive benchmark plots using Plotly.js with automatic daily updates. Benchmarks are organized into separate CPU and GPU (H100) categories.

### Initial Setup

1. **Update Benchmark Source Path** (if needed)

   Edit `scripts/sync_benchmarks.sh` and modify the `SOURCE_DIR` variable:

   ```bash
   SOURCE_DIR="/home/TROMP/SPECFEMPP-benchmarks/nightly_benchmarks/data/benchmarks"
   ```

2. **Update Destination Path** (if webpage moved to different location)

   Edit `scripts/sync_benchmarks.sh` and modify these variables:

   ```bash
   DEST_DIR="/projects/TROMP/public_html/specfempp-review-panel/benchmarks"
   MANIFEST_CPU_FILE="/projects/TROMP/public_html/specfempp-review-panel/benchmarks_manifest_cpu.json"
   MANIFEST_GPU_FILE="/projects/TROMP/public_html/specfempp-review-panel/benchmarks_manifest_gpu.json"
   ```

3. **Run Initial Setup**

   ```bash
   cd /projects/TROMP/public_html/specfempp-review-panel
   ./scripts/setup_cron.sh
   ```

   This will:
   - Sync CPU and GPU benchmark data separately from source to web directory
   - Generate `benchmarks_manifest_cpu.json` and `benchmarks_manifest_gpu.json` listing all available files
   - Set up a cron job to run daily at 6:00 AM
   - Create a log file at `sync_benchmarks.log`

### Manual Sync (Optional)

To manually sync benchmarks without waiting for cron:

```bash
./scripts/sync_benchmarks.sh
```

### How It Works

- **`sync_benchmarks.sh`**: Uses `rsync` to copy only `profiles.json` files from the benchmark source directory (separately for CPU and GPU), then auto-generates separate manifest files for each
- **`setup_cron.sh`**: Configures a daily cron job (6 AM) to keep benchmarks up-to-date
- **`benchmarks_manifest_cpu.json`**: Lists all CPU benchmark files with relative paths for the browser to fetch
- **`benchmarks_manifest_gpu.json`**: Lists all GPU benchmark files with relative paths for the browser to fetch
- **`js/plot_benchmarks.js`**: Fetches both manifests and renders interactive Plotly charts in a 2x2 grid (CPU top row, GPU bottom row)

### Benchmark Plot Features

- **Dual Architecture Display**: 
  - CPU benchmarks displayed in top row
  - GPU (H100) benchmarks displayed in bottom row
  - 2x2 grid layout on desktop, stacked vertically on mobile
- **Interactive**: Hover for detailed timing information including hardware specs and git commit details
- **Responsive Date Controls**: 
  - Range sliders (minimaps) on each subplot
  - Quick selectors (1w, 1m, 3m, All) synchronized across all plots
  - Synchronized zooming across all subplots
- **Legend Interaction**:
  - Single click to toggle individual regions
  - Double-click to isolate a single region (hide all others)
- **Stacked Bars**: Shows execution time breakdown by computation region
- **Click-through to GitHub**: Click on bars to view the corresponding git commit
- **Client-Side Rendering**: No server processing needed - all happens in browser

### Moving to a Different Server

If deploying to a new location:

1. Update paths in `scripts/sync_benchmarks.sh`:
   - `SOURCE_DIR`: Where benchmark data is stored
   - `DEST_DIR`: Where web files are served from
   - `MANIFEST_CPU_FILE`: Location of the generated CPU manifest
   - `MANIFEST_GPU_FILE`: Location of the generated GPU manifest

2. Run the setup script:
   ```bash
   ./scripts/setup_cron.sh
   ```

3. Verify cron job:
   ```bash
   crontab -l
   ```

4. Check logs for any errors:
   ```bash
   tail -f sync_benchmarks.log
   ```

## Files

### Core Web Files
- `index.html` - Main HTML structure
- `css/style.css` - Styling and responsive layout
- `js/pr_info_fetch.js` - JavaScript for fetching PR data from GitHub API
- `js/plot_benchmarks.js` - Interactive Plotly benchmark plots
- `token.js` - Configuration file (create this - not tracked in git!)

### Benchmark Sync Scripts
- `scripts/sync_benchmarks.sh` - Syncs benchmark data and generates manifest
- `scripts/setup_cron.sh` - Sets up automated daily sync via cron

### Generated Files
- `benchmarks_manifest_cpu.json` - List of CPU benchmark files (auto-generated)
- `benchmarks_manifest_gpu.json` - List of GPU benchmark files (auto-generated)
- `benchmarks/cpu/` - Directory containing synced CPU benchmark data
- `benchmarks/gpu/` - Directory containing synced GPU benchmark data
- `sync_benchmarks.log` - Log file from sync operations

## Security Notes

- **Never commit `token.js`** to version control
- **Regenerate tokens periodically** for better security
- **Use minimal permissions** - only grant required scopes

## Browser Compatibility

Requires modern browser with support for:
- CSS Grid & Flexbox
- ES6 JavaScript (async/await, fetch API)
- Sticky positioning
