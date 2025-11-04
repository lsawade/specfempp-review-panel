async function fetchFailingPRs() {
    const container = document.getElementById('failing-prs');
    
    // Use config from config.js
    const GITHUB_REPO = 'PrincetonUniversity/SPECFEMPP';
    const GITHUB_TOKEN = TOKEN.GITHUB_TOKEN;
    
    try {
        const headers = {
            'Accept': 'application/vnd.github.v3+json'
        };
        
        if (GITHUB_TOKEN) {
            headers['Authorization'] = `token ${GITHUB_TOKEN}`;
        }

        // Fetch open pull requests
        const response = await fetch(
            `https://api.github.com/repos/${GITHUB_REPO}/pulls?state=open&per_page=100`,
            { headers }
        );

        if (!response.ok) {
            throw new Error(`GitHub API error: ${response.status}`);
        }

        const prs = await response.json();
        
        if (prs.length === 0) {
            container.innerHTML = '<p class="no-failures">No open PRs</p>';
            return;
        }
        
        // Collect all PRs with their check details
        const prData = [];
        const allCheckNames = new Set();
        
        for (const pr of prs) {
            // Fetch check runs for each PR
            const checksResponse = await fetch(
                `https://api.github.com/repos/${GITHUB_REPO}/commits/${pr.head.sha}/check-runs`,
                { headers }
            );
            
            // Fetch status (for external checks like Jenkins)
            const statusResponse = await fetch(
                `https://api.github.com/repos/${GITHUB_REPO}/commits/${pr.head.sha}/status`,
                { headers }
            );
            
            let checks = {};
            
            if (checksResponse.ok) {
                const data = await checksResponse.json();
                for (const run of data.check_runs) {
                    const key = `${run.name}|github`;
                    checks[key] = {
                        name: run.name,
                        status: run.conclusion || run.status,
                        type: 'github'
                    };
                    allCheckNames.add(key);
                }
            }
            
            if (statusResponse.ok) {
                const data = await statusResponse.json();
                for (const check of data.statuses) {
                    const key = `${check.context}|external`;
                    checks[key] = {
                        name: check.context,
                        status: check.state === 'success' ? 'success' : 
                               check.state === 'failure' ? 'failure' : 
                               check.state === 'error' ? 'error' : 
                               check.state === 'pending' ? 'pending' : 'unknown',
                        type: 'external'
                    };
                    allCheckNames.add(key);
                }
            }
            
            prData.push({ pr, checks });
            
            // Rate limiting - wait a bit between requests
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        // Sort check names: GitHub Actions first (alphabetically), then External (alphabetically)
        // with ReadTheDocs at the very end
        const sortedCheckNames = Array.from(allCheckNames).sort((a, b) => {
            const [nameA, typeA] = a.split('|');
            const [nameB, typeB] = b.split('|');
            
            // GitHub checks first, external checks last
            if (typeA !== typeB) {
                return typeA === 'github' ? -1 : 1;
            }
            
            // Within external checks, put ReadTheDocs last
            if (typeA === 'external') {
                const isReadTheDocsA = nameA.toLowerCase().includes('readthedocs') || nameA.toLowerCase().includes('docs/');
                const isReadTheDocsB = nameB.toLowerCase().includes('readthedocs') || nameB.toLowerCase().includes('docs/');
                
                if (isReadTheDocsA !== isReadTheDocsB) {
                    return isReadTheDocsA ? 1 : -1;
                }
            }
            
            // Alphabetical within same type
            return nameA.localeCompare(nameB);
        });
        
        // Generate table
        const statusEmoji = {
            'success': '✓',
            'failure': '✗',
            'error': '✗',
            'pending': '⋯',
            'in_progress': '⋯',
            'queued': '⋯',
            'unknown': '?',
            'skipped': '—'
        };
        
        let html = '<div class="pr-matrix-container">';
        html += '<table class="pr-matrix">';
        
        // Header row
        html += '<thead><tr>';
        html += '<th class="pr-info-cell">Pull Request</th>';
        html += '<th class="pr-author-cell">Author</th>';
        
        for (const checkKey of sortedCheckNames) {
            const [checkName, checkType] = checkKey.split('|');
            const typeLabel = checkType === 'github' ? '🔵' : '🟣'; // Blue for GitHub, Purple for External
            html += `<th class="check-header"><div class="check-name" title="${checkName}">${typeLabel} ${checkName}</div></th>`;
        }
        
        html += '</tr></thead>';
        
        // Body rows
        html += '<tbody>';
        
        for (const { pr, checks } of prData) {
            html += '<tr>';
            html += `<td class="pr-info-cell"><a href="${pr.html_url}" target="_blank">#${pr.number}: ${pr.title}</a></td>`;
            html += `<td class="pr-author-cell">${pr.user.login}</td>`;
            
            for (const checkKey of sortedCheckNames) {
                const check = checks[checkKey];
                
                if (check) {
                    const emoji = statusEmoji[check.status] || '?';
                    const statusClass = check.status === 'success' ? 'check-success' :
                                      check.status === 'failure' || check.status === 'error' ? 'check-failure' :
                                      check.status === 'pending' || check.status === 'in_progress' || check.status === 'queued' ? 'check-pending' :
                                      'check-unknown';
                    
                    html += `<td class="check-cell ${statusClass}" title="${check.name}: ${check.status}">${emoji}</td>`;
                } else {
                    html += `<td class="check-cell check-empty" title="Not run">—</td>`;
                }
            }
            
            html += '</tr>';
        }
        
        html += '</tbody>';
        html += '</table>';
        html += '</div>';
        
        container.innerHTML = html;
    } catch (error) {
        console.error('Error fetching PRs:', error);
        container.innerHTML = `<p class="error">Error loading PRs: ${error.message}</p>`;
    }
}

// Load failing PRs when page loads
document.addEventListener('DOMContentLoaded', fetchFailingPRs);
