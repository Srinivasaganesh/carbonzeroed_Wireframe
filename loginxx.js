        // Configuration and Global State
        const CONFIG = {
            DATA_VERIFICATION_WEBHOOK: 'http://localhost:5678/webhook/data-verification',
            DATA_VERIFICATION_UPDATE_WEBHOOK: 'http://localhost:5678/webhook/data-verification-update',
            AUTH_TOKEN: 'Bearer devtoken123',
            EDITABLE_COLUMNS: {
                destination: { type: 'string', label: 'Destination' },
                class_of_travel: { type: 'string', label: 'Class of Travel' },
                no_of_passengers: { type: 'number', min: 0, integer: true },
                trip_mode: { type: 'string', label: 'Trip Mode' },
                vehicle_model: { type: 'string' },
                vehicle_make: { type: 'string', label: 'Vehicle Make' },
                site: { type: 'string' },
                account_type: { type: 'string' },
                consumption: { type: 'number', min: 0 },
                unit: { type: 'string' },
                amount_spent: { type: 'number', min: 0 },
                scope: { type: 'string' },
                emission_factor: { type: 'number', min: 0 },
                reason: { type: 'string', max: 500 }
            }
        };

        // Hardcoded webhook URLs for advanced processing
        const WEBHOOK_URLS = [
            'http://localhost:5678/webhook/Energy_Utilities',
            'http://localhost:5678/webhook/Water_land_Use',
            'http://localhost:5678/webhook/Fuels_and_Combustion',
            'http://localhost:5678/webhook/Mobility',
            'http://localhost:5678/webhook/Procurement_and_waste'
        ];

        const EXTRACTION_WEBHOOK_URL = 'http://localhost:5678/webhook/extraction';

        // Global state variables
        let currentPage = 1;
        let pageSize = 25;
        let totalRecords = 0;
        let totalPages = 0;
        let allData = [];
        let filteredData = [];
        let extractedDatasetFilename = null;

        // Store responses globally
        let apiResponses = {
            upload: null,
            emission: null,
            report: null,
            dataset: null,
            calculation: null,
            advanced: null
        };

        // Store global processing results and HTML data
        let processingResults = {
            uploadedFilenames: [],
            webhookResponses: [],
            extractionResult: null,
            htmlData: null
        };

        // Utility Functions
        function showToast(message, type = 'success') {
            const toast = document.createElement('div');
            toast.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                background: ${type === 'success' ? '#06402B' : '#ef4444'};
                color: white;
                padding: 12px 20px;
                border-radius: 8px;
                z-index: 1000;
                animation: slideIn 0.3s ease-out;
                box-shadow: 0 4px 15px rgba(0,0,0,0.2);
            `;
            toast.textContent = message;
            document.body.appendChild(toast);
            setTimeout(() => toast.remove(), 3000);
        }

        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text == null ? '' : String(text);
            return div.innerHTML;
        }

        function slugify(text) {
            return text.toLowerCase()
                      .replace(/[^a-z0-9]+/g, '-')
                      .replace(/(^-|-$)/g, '');
        }

        // Navigation Functions
        function showInterface(interfaceName) {
			// Hide all interfaces
			document.querySelectorAll('.interface-section').forEach(section => {
				section.classList.remove('active');
			});

			// Remove active class from all nav links and sub-nav links
			document.querySelectorAll('.nav-link, .sub-nav-link').forEach(link => {
				link.classList.remove('active');
			});

			// Show target interface
			const targetInterface = document.getElementById(`${interfaceName}-interface`) || document.getElementById('welcome-screen');
			targetInterface.classList.add('active');

			// Set appropriate nav link as active
			const navMapping = {
				'welcome': 'welcome',
				'advanced-processing': 'extraction',
				'custom-agent': 'extraction',
				'verification': 'verification',
				'dataset-choice': 'emission',
				'emission-calculation': 'emission',
				'reporting': 'reporting'
			};

			const mainSection = navMapping[interfaceName] || 'welcome';
			const mainNavLink = document.querySelector(`[data-section="${mainSection}"]`);
			if (mainNavLink) mainNavLink.classList.add('active');

			const subNavLink = document.querySelector(`[data-subsection="${interfaceName}"]`);
			if (subNavLink) subNavLink.classList.add('active');
		}

        // Navigation Event Listeners
        document.addEventListener('DOMContentLoaded', function() {
            // Main navigation
            document.querySelectorAll('.nav-link').forEach(link => {
				link.addEventListener('click', function(e) {
					e.preventDefault();
					const section = this.getAttribute('data-section');
					if (section) {
						document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
						this.classList.add('active');
						
						// If it's a main section without subsections, show the interface directly
						if (section === 'verification' || section === 'reporting') {
							showInterface(section);
						}
					}
				});
			});

            // Sub-navigation
            document.querySelectorAll('.sub-nav-link').forEach(link => {
				link.addEventListener('click', function(e) {
					e.preventDefault();
					const subsection = this.getAttribute('data-subsection');
					if (subsection) {
						document.querySelectorAll('.sub-nav-link').forEach(l => l.classList.remove('active'));
						this.classList.add('active');
						showInterface(subsection);
					}
				});
			});

            // Set default active state
			const firstNavLink = document.querySelector('.nav-link[data-section="extraction"]');
			if (firstNavLink) firstNavLink.classList.add('active');
			
			const firstSubNavLink = document.querySelector('.sub-nav-link[data-subsection="advanced-processing"]');
			if (firstSubNavLink) firstSubNavLink.classList.add('active');
			
			showInterface('welcome');
			updateAgentPath();
			showToast('SustainIQ Dashboard loaded successfully');
		});

        // Advanced Processing Functions
        function updateProgressStep(stepNumber, status) {
            const step = document.getElementById(`step${stepNumber}`);
            if (!step) return;
            
            const circle = step.querySelector('.step-circle');
            circle.classList.remove('active', 'completed');
            
            if (status === 'active') {
                circle.classList.add('active');
            } else if (status === 'completed') {
                circle.classList.add('completed');
                circle.innerHTML = '✓';
            }
            
            // Mark previous steps as completed
            if (status === 'active' || status === 'completed') {
                for (let i = 1; i < stepNumber; i++) {
                    const prevStep = document.getElementById(`step${i}`);
                    if (prevStep) {
                        const prevCircle = prevStep.querySelector('.step-circle');
                        prevCircle.classList.remove('active');
                        prevCircle.classList.add('completed');
                        prevCircle.innerHTML = '✓';
                        prevStep.classList.add('completed');
                    }
                }
            }
        }

        function updateApiStatus(apiId, status, message = '') {
            const apiElement = document.getElementById(apiId);
            if (!apiElement) return;
            
            const statusText = apiElement.querySelector('.api-status-text');
            apiElement.classList.remove('loading', 'success', 'error');
            statusText.classList.remove('loading', 'success', 'error');
            
            apiElement.classList.add(status);
            statusText.classList.add(status);
            
            switch(status) {
                case 'loading':
                    statusText.textContent = 'Processing...';
                    break;
                case 'success':
                    statusText.textContent = message || 'Success';
                    break;
                case 'error':
                    statusText.textContent = message || 'Failed';
                    break;
            }
        }

        // File Handling Functions
        function setupFileDrop(dropZoneId, fileInputId, previewId, gridId, sectionsToShow) {
            const dropZone = document.getElementById(dropZoneId);
            const fileInput = document.getElementById(fileInputId);
            if (!dropZone || !fileInput) return;

            dropZone.addEventListener('click', () => fileInput.click());
            dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
            dropZone.addEventListener('dragleave', (e) => { e.preventDefault(); dropZone.classList.remove('dragover'); });
            dropZone.addEventListener('drop', (e) => {
                e.preventDefault();
                dropZone.classList.remove('dragover');
                fileInput.files = e.dataTransfer.files;
                handleFileSelection(fileInput, previewId, gridId, sectionsToShow);
            });
            fileInput.addEventListener('change', () => handleFileSelection(fileInput, previewId, gridId, sectionsToShow));
        }

        function handleFileSelection(fileInput, previewId, gridId, sectionsToShow) {
            if (fileInput.files.length === 0) return;
            const grid = document.getElementById(gridId);
            grid.innerHTML = '';
            
            if (gridId === 'advancedFilesGrid') {
                processingResults.uploadedFilenames = [];
            }
            
            Array.from(fileInput.files).forEach((file, index) => {
                const fileItem = createFileItem(file, index);
                grid.appendChild(fileItem);
                
                if (gridId === 'advancedFilesGrid') {
                    processingResults.uploadedFilenames.push(file.name);
                }
            });

            // Display filenames for advanced processing
            if (gridId === 'advancedFilesGrid') {
                const filenamesList = document.getElementById('advancedFilenamesList');
                if (filenamesList) {
                    filenamesList.innerHTML = processingResults.uploadedFilenames
                        .map(name => `• ${name}`)
                        .join('<br>');
                }
                updateProgressStep(1, 'completed');
            }

            document.getElementById(previewId).style.display = 'block';
            sectionsToShow.forEach(id => {
                const element = document.getElementById(id);
                if (element) element.style.display = 'block';
            });
        }

        function createFileItem(file, index) {
            const div = document.createElement('div');
            div.className = 'file-item';
            const iconMap = { pdf: '📄', word: '📝', document: '📝', excel: '📊', spreadsheet: '📊', image: '🖼️', csv: '📈' };
            const type = Object.keys(iconMap).find(key => file.type.includes(key)) || 'default';
            const size = (file.size / 1024 / 1024).toFixed(2);
            div.innerHTML = `
                <div class="file-icon">${iconMap[type] || '📄'}</div>
                <div class="file-info">
                    <div class="file-name">${file.name}</div>
                    <div class="file-details">${size} MB • ${file.type || 'Unknown'}</div>
                </div>
            `;
            return div;
        }

        // Setup file drops
        setupFileDrop('advancedDropZone', 'advancedFileInput', 'advancedFilesPreview', 'advancedFilesGrid', ['advancedCategoriesSection', 'advancedSubmitSection']);
        setupFileDrop('datasetDropZone', 'datasetFileInput', 'datasetFilesPreview', 'datasetFilesGrid', ['datasetSubmitSection']);

        // Advanced Processing API Functions
        async function callApi(url, formData, apiId) {
            try {
                updateApiStatus(apiId, 'loading');
                const response = await fetch(url, { method: 'POST', body: formData });

                let responseData;
                const contentType = response.headers.get('content-type');
                
                if (contentType && contentType.includes('application/json')) {
                    responseData = await response.json();
                } else {
                    responseData = await response.text();
                }

                if (response.ok) {
                    updateApiStatus(apiId, 'success', `Completed (${response.status})`);
                    return { success: true, data: responseData, url: url, status: response.status };
                } else {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
            } catch (error) {
                updateApiStatus(apiId, 'error', `Error: ${error.message}`);
                return { success: false, error: error.message, url: url };
            }
        }

        async function callExtractionApi(filenames, categoryData = {}) {
            try {
                updateApiStatus('extraction', 'loading');
                
                const formData = new FormData();
                formData.append('filenames', JSON.stringify(filenames));
                formData.append('extraction_type', 'advanced_processing');
                
                Object.entries(categoryData).forEach(([key, value]) => {
                    if (value) formData.append(key, value);
                });
                
                const response = await fetch(EXTRACTION_WEBHOOK_URL, { method: 'POST', body: formData });

                let responseData;
                const contentType = response.headers.get('content-type');
                
                if (contentType && contentType.includes('application/json')) {
                    responseData = await response.json();
                } else {
                    responseData = await response.text();
                }

                if (response.ok) {
                    updateApiStatus('extraction', 'success', 'Extraction completed');
                    return { success: true, data: responseData, message: 'Extraction completed successfully' };
                } else {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
            } catch (error) {
                updateApiStatus('extraction', 'error', `Error: ${error.message}`);
                return { success: false, error: error.message, message: 'Extraction failed' };
            }
        }

        // HTML Processing Functions
        function extractHtmlContent(responseData) {
            if (typeof responseData === 'string' && responseData.trim().toLowerCase().includes('<!doctype html>')) {
                return responseData;
            }

            if (typeof responseData === 'object' && responseData !== null) {
                const htmlProperties = ['html', 'content', 'data', 'result', 'output', 'report'];
                for (const prop of htmlProperties) {
                    const potentialHtml = responseData[prop];
                    if (typeof potentialHtml === 'string' && potentialHtml.trim().toLowerCase().includes('<!doctype html>')) {
                        return potentialHtml;
                    }
                }
            }
            return null;
        }

        function openHtmlInNewTab(responseData) {
            try {
                let htmlContent = extractHtmlContent(responseData);
                
                if (!htmlContent) {
                    htmlContent = `
                        <!DOCTYPE html>
                        <html lang="en">
                        <head>
                            <meta charset="UTF-8">
                            <meta name="viewport" content="width=device-width, initial-scale=1.0">
                            <title>Extraction Result</title>
                            <style>
                                body { font-family: Arial, sans-serif; padding: 20px; background: #f5f5f5; }
                                .container { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                                pre { background: #f8f9fa; padding: 15px; border-radius: 4px; overflow-x: auto; white-space: pre-wrap; }
                            </style>
                        </head>
                        <body>
                            <div class="container">
                                <h1>Extraction Result</h1>
                                <pre>${escapeHtml(typeof responseData === 'string' ? responseData : JSON.stringify(responseData, null, 2))}</pre>
                            </div>
                        </body>
                        </html>
                    `;
                }
                
                const blob = new Blob([htmlContent], { type: 'text/html' });
                const url = URL.createObjectURL(blob);
                const newTab = window.open(url, '_blank');
                
                if (newTab) {
                    newTab.onload = () => URL.revokeObjectURL(url);
                    showToast('HTML report opened in new tab!');
                    return true;
                } else {
                    throw new Error('Popup blocked or failed to open');
                }
                
            } catch (error) {
                console.error('Primary method failed, using fallback:', error);
                showHtmlInModal(responseData);
                return false;
            }
        }

        function showHtmlInModal(responseData) {
            let htmlContent = extractHtmlContent(responseData);
            if (!htmlContent) {
                htmlContent = `<pre>${escapeHtml(JSON.stringify(responseData, null, 2))}</pre>`;
            }
            
            const modal = document.createElement('div');
            modal.style.cssText = `
                position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                background: rgba(0, 0, 0, 0.8); z-index: 10000;
                display: flex; justify-content: center; align-items: center;
            `;
            
            const modalContent = document.createElement('div');
            modalContent.style.cssText = `
                background: white; width: 90%; height: 90%; border-radius: 10px;
                overflow: hidden; position: relative;
            `;
            
            const closeBtn = document.createElement('button');
            closeBtn.textContent = '× Close';
            closeBtn.style.cssText = `
                position: absolute; top: 10px; right: 10px; z-index: 10001;
                background: #ef4444; color: white; border: none; padding: 10px 15px;
                border-radius: 5px; cursor: pointer;
            `;
            
            const iframe = document.createElement('iframe');
            iframe.style.cssText = 'width: 100%; height: 100%; border: none;';
            iframe.srcdoc = htmlContent;
            
            modalContent.appendChild(closeBtn);
            modalContent.appendChild(iframe);
            modal.appendChild(modalContent);
            document.body.appendChild(modal);
            
            const closeModal = () => document.body.removeChild(modal);
            closeBtn.addEventListener('click', closeModal);
            modal.addEventListener('click', (e) => {
                if (e.target === modal) closeModal();
            });
            
            showToast('HTML report displayed in modal');
        }

        function showHtmlActionButtons(responseData) {
            processingResults.htmlData = responseData;
            
            const htmlActionsSection = document.getElementById('advancedHtmlActionsSection');
            const htmlActionsContainer = document.getElementById('advancedHtmlActions');
            
            htmlActionsContainer.innerHTML = '';
            
            const buttons = [
                { text: '👁️ Preview HTML', class: 'preview', action: () => showHtmlInModal(responseData) },
                { text: '🔗 Open in New Tab', class: 'open', action: () => openHtmlInNewTab(responseData) },
                { text: '💾 Download HTML', class: 'download', action: () => downloadHtml(responseData) },
                { text: '📋 Copy HTML', class: 'copy', action: () => copyHtmlToClipboard(responseData) }
            ];
            
            buttons.forEach(buttonConfig => {
                const button = document.createElement('button');
                button.className = `html-action-btn ${buttonConfig.class}`;
                button.textContent = buttonConfig.text;
                button.addEventListener('click', buttonConfig.action);
                htmlActionsContainer.appendChild(button);
            });
            
            htmlActionsSection.style.display = 'block';
        }

        function hideHtmlActionButtons() {
            const htmlActionsSection = document.getElementById('advancedHtmlActionsSection');
            htmlActionsSection.style.display = 'none';
            processingResults.htmlData = null;
        }

        function downloadHtml(responseData) {
            try {
                let htmlContent = extractHtmlContent(responseData);
                if (!htmlContent) {
                    htmlContent = `
                        <!DOCTYPE html>
                        <html><head><title>Extraction Result</title></head>
                        <body><pre>${escapeHtml(JSON.stringify(responseData, null, 2))}</pre></body></html>
                    `;
                }
                
                const blob = new Blob([htmlContent], { type: 'text/html' });
                const url = URL.createObjectURL(blob);
                
                const a = document.createElement('a');
                a.href = url;
                a.download = `extraction_result_${new Date().getTime()}.html`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                
                setTimeout(() => URL.revokeObjectURL(url), 1000);
                showToast('HTML file downloaded successfully!');
            } catch (error) {
                showToast('Download failed: ' + error.message, 'error');
            }
        }

        function copyHtmlToClipboard(responseData) {
            try {
                let htmlContent = extractHtmlContent(responseData);
                if (!htmlContent) {
                    htmlContent = JSON.stringify(responseData, null, 2);
                }
                
                navigator.clipboard.writeText(htmlContent).then(() => {
                    showToast('HTML content copied to clipboard!');
                }).catch(() => {
                    showToast('Copy failed - please try manual copy', 'error');
                });
            } catch (error) {
                showToast('Copy failed: ' + error.message, 'error');
            }
        }

        function showAdvancedStatus(message, type) {
            const statusEl = document.getElementById('advancedStatusMessage');
            statusEl.textContent = message;
            statusEl.className = `status-message status-${type}`;
            statusEl.style.display = 'block';
            
            if (type !== 'info' && type !== 'success') {
                setTimeout(() => {
                    if (statusEl.textContent === message) statusEl.style.display = 'none';
                }, 8000);
            } else if (type === 'success' && !processingResults.htmlData) {
                setTimeout(() => {
                    if (statusEl.textContent === message) statusEl.style.display = 'none';
                }, 8000);
            }
        }

        function displayAdvancedResults() {
            const responseSection = document.getElementById('advancedResponseSection');
            const responseFormatted = document.getElementById('advancedResponseFormatted');
            const responseRaw = document.getElementById('advancedResponseRaw');
            
            responseSection.style.display = 'block';
            
            let formattedHtml = '<div style="font-family: inherit;">';
            
            formattedHtml += '<h4 style="color: #06402B; margin-bottom: 15px;">Uploaded Files</h4>';
            formattedHtml += '<div style="margin-bottom: 20px; background: #f0fdf4; padding: 15px; border-radius: 8px;">';
            processingResults.uploadedFilenames.forEach(filename => {
                formattedHtml += `<div style="margin: 5px 0;">📄 ${filename}</div>`;
            });
            formattedHtml += '</div>';
            
            formattedHtml += '<h4 style="color: #06402B; margin-bottom: 15px;">Processing Webhook Results</h4>';
            formattedHtml += '<div style="margin-bottom: 20px;">';
            processingResults.webhookResponses.forEach((result, index) => {
                const status = result.success ? '✅' : '❌';
                const statusColor = result.success ? '#06402B' : '#ef4444';
                formattedHtml += `
                    <div style="margin: 10px 0; padding: 10px; background: #f8fafc; border-radius: 8px; border-left: 4px solid ${statusColor};">
                        <strong>${status} Webhook ${index + 1} (${result.url.split('/').pop()}):</strong> 
                        ${result.success ? `Success (Status: ${result.status})` : `Failed - ${result.error}`}
                    </div>
                `;
            });
            formattedHtml += '</div>';
            
            if (processingResults.extractionResult) {
                formattedHtml += '<h4 style="color: #06402B; margin-bottom: 15px;">Smart Extraction Result</h4>';
                if (processingResults.extractionResult.success) {
                    formattedHtml += '<div style="color: #06402B; font-weight: 600; margin-bottom: 10px;">✅ Extraction Successful</div>';
                    formattedHtml += '<div style="background: #f0fdf4; padding: 15px; border-radius: 8px; margin: 10px 0;">';
                    formattedHtml += '<div style="margin-bottom: 10px; font-weight: 600;">HTML rendering options available above</div>';
                    const data = processingResults.extractionResult.data;
                    const snippet = typeof data === 'string' ? data.substring(0, 500) + (data.length > 500 ? '...' : '') : JSON.stringify(data, null, 2);
                    formattedHtml += `<pre style="white-space: pre-wrap; font-family: inherit; margin: 0; max-height: 200px; overflow-y: auto;">${escapeHtml(snippet)}</pre>`;
                    formattedHtml += '</div>';
                } else {
                    formattedHtml += '<div style="color: #ef4444; font-weight: 600;">❌ Extraction Failed</div>';
                    formattedHtml += `<div style="margin: 10px 0; color: #ef4444;">${processingResults.extractionResult.error || 'Unknown error'}</div>`;
                }
            } else {
                formattedHtml += '<h4 style="color: #ef4444; margin-bottom: 15px;">Smart Extraction Result</h4>';
                formattedHtml += '<div style="color: #ef4444; font-weight: 600;">❌ Extraction not triggered (not all webhooks successful)</div>';
            }
            formattedHtml += '</div>';
            
            responseFormatted.innerHTML = formattedHtml;
            responseRaw.textContent = JSON.stringify(processingResults, null, 2);
        }

        // Advanced Processing Form Handler
        document.getElementById('advancedUploadForm').addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const files = Array.from(document.getElementById('advancedFileInput').files);
            if (files.length === 0) {
                showAdvancedStatus('Please select at least one file!', 'error');
                return;
            }

            const submitButton = document.getElementById('advancedSubmitButton');
            
            try {
                processingResults.webhookResponses = [];
                processingResults.extractionResult = null;
                hideHtmlActionButtons();
                
                submitButton.innerHTML = '<span class="loading-spinner"></span>Processing...';
                submitButton.disabled = true;
                
                document.getElementById('progressSection').style.display = 'block';
                document.getElementById('apiStatus').style.display = 'block';
                
                updateProgressStep(2, 'active');
                showAdvancedStatus('Starting parallel processing of 5 webhooks...', 'info');

                const formData = new FormData();
                
                files.forEach((file, index) => {
                    formData.append(`file_${index}`, file);
                    formData.append(`filename_${index}`, file.name);
                });
                
                const textareas = document.querySelectorAll('#advancedCategoriesSection .category-textarea');
                const categoryData = {};
                textareas.forEach(textarea => {
                    if (textarea.value.trim()) {
                        formData.append(textarea.name, textarea.value.trim());
                        categoryData[textarea.name] = textarea.value.trim();
                    }
                });
                
                formData.append('file_count', files.length.toString());
                formData.append('timestamp', new Date().toISOString());

                
const selectedAgents = getSelectedCustomAgents();
appendCustomAgentStatusItems(selectedAgents);

// Build promises for 5 n8n webhooks (each gets its own FormData clone)
const webhookPromises = WEBHOOK_URLS.map((url, index) => 
  callApi(url, cloneFormData(formData), `webhook${index + 1}`)
);

// Build promises for selected Python custom agents (attach per-agent context)
const customPromises = selectedAgents.map(a => {
  const fd = cloneFormData(formData);
  const ctxEl = document.getElementById(`ctx_${a.slug}`);
  const ctx = ctxEl ? ctxEl.value.trim() : "";
  if (ctx) fd.append('custom_context', ctx);
  return callApi(a.url, fd, `custom_${a.slug}`);
});

const allPromises = webhookPromises.concat(customPromises);
const webhookResults = await Promise.all(allPromises);
processingResults.webhookResponses = webhookResults;

                
                updateProgressStep(2, 'completed');
                
                const successfulWebhooks = webhookResults.filter(result => result.success).length;
                const totalWebhooks = webhookResults.length;
                
                if (successfulWebhooks === totalWebhooks) {
                    updateProgressStep(3, 'active');
                    showAdvancedStatus(`All ${totalWebhooks} webhooks successful! Starting smart extraction...`, 'info');
                    
                    const extractionResult = await callExtractionApi(processingResults.uploadedFilenames, categoryData);
                    processingResults.extractionResult = extractionResult;
                    
                    updateProgressStep(3, 'completed');
                    
                    if (extractionResult.success) {
                        showAdvancedStatus('Processing completed successfully!', 'success');
                        showHtmlActionButtons(extractionResult.data);
                        openHtmlInNewTab(extractionResult.data);
                    } else {
                        showAdvancedStatus(`All webhooks successful but extraction failed: ${extractionResult.error}`, 'error');
                    }
                } else {
                    showAdvancedStatus(`Only ${successfulWebhooks}/${totalWebhooks} webhooks successful. Extraction not triggered (requires all webhooks to succeed).`, 'error');
                    updateApiStatus('extraction', 'error', 'Skipped (not all webhooks successful)');
                }
                
                displayAdvancedResults();
                
            } catch (error) {
                showAdvancedStatus(`Processing failed: ${error.message}`, 'error');
                console.error('Processing error:', error);
            } finally {
                submitButton.innerHTML = 'Start Advanced Processing';
                submitButton.disabled = false;
            }
        });

        function switchAdvancedTab(event, tabId) {
            const container = event.target.closest('.response-container');
            container.querySelectorAll('.response-tab').forEach(tab => tab.classList.remove('active'));
            container.querySelectorAll('.response-panel').forEach(panel => panel.classList.remove('active'));
            event.target.classList.add('active');
            container.querySelector(`#${tabId}`).classList.add('active');
        }

        function copyAdvancedResponse() {
            const textToCopy = JSON.stringify(processingResults, null, 2);
            navigator.clipboard.writeText(textToCopy).then(() => {
                showToast('Results copied to clipboard!');
            });
        }

        function clearAdvancedResponse() {
            document.getElementById('advancedResponseSection').style.display = 'none';
            hideHtmlActionButtons();
            processingResults.webhookResponses = [];
            processingResults.extractionResult = null;
        }

        // Custom Agent Functions
        function updateAgentPath() {
            const name = document.getElementById('agentName').value.trim();
            const pathInput = document.getElementById('agentPath');
            
            if (name && !pathInput.dataset.userModified) {
                pathInput.value = 'custom-agents/' + slugify(name);
            }
        }

        document.getElementById('agentPath').addEventListener('input', function() {
            this.dataset.userModified = 'true';
        });

        document.getElementById('agentName').addEventListener('input', updateAgentPath);

        function parseCredentialPair(credString) {
            const [id, name] = (credString || '').split('|').map(x => x.trim());
            return { id, name };
        }

        function generateNodeId(prefix) {
            return prefix + '-' + Math.random().toString(36).slice(2, 10);
        }

        function generateFanOutCode(mimeTypes) {
            return `
const TARGET_BIN_KEY = 'pdf';
const ACCEPT = new Set('${mimeTypes}'.split(',').map(s=>s.trim()).filter(Boolean));
const out = [];
for (const item of $input.all()) {
  const bin = item.binary || {};
  const baseJson = item.json || {};
  for (const [key,file] of Object.entries(bin)) {
    if (file?.mimeType && ACCEPT.size && !ACCEPT.has(file.mimeType)) continue;
    out.push({ 
      json: { 
        ...baseJson, 
        originalBinaryKey: key, 
        originalFileName: file?.fileName || null, 
        originalMimeType: file?.mimeType || null 
      }, 
      binary: { [TARGET_BIN_KEY]: file } 
    });
  }
}
return out;
            `.trim();
        }

        function generateJsonScrubberCode() {
            return `
// Extract JSON from LLM output
const inputItems = $input.all();
const outputItems = [];
for (const item of inputItems) {
  try {
    let s = item.json.output || item.json.text || item.json.content || JSON.stringify(item.json);
    s = s.replace(/\\\`\\\`\\\`json\\s*\\n?/gi,'').replace(/\\\`\\\`\\\`\\s*$/gi,'').trim();
    const a = s.indexOf('{'); const b = s.lastIndexOf('}');
    if(a!==-1 && b!==-1 && b>a) s = s.substring(a,b+1);
    outputItems.push({ json: JSON.parse(s) });
  } catch (e) {
    outputItems.push({ json: { items: [], _error: 'JSON parse failed: '+e.message } });
  }
}
return outputItems;
            `.trim();
        }

        function generateFinalJsonMapperCode() {
            return `
// AFTER Merge/Agent
const inputs = $input.all();
const rows = [];
const seen = new Set();
function isAllNull(obj){ return Object.values(obj).every(v=>v===null||v===undefined||v===''); }
function pushRecord(rec){
  if(!rec || typeof rec!=='object') return;
  const normalized = Object.assign({}, rec);
  // normalize file_name -> filename
  if('file_name' in normalized && !('filename' in normalized)) normalized.filename = normalized.file_name;
  if(isAllNull(normalized)) return;
  const key = JSON.stringify(normalized);
  if(seen.has(key)) return; seen.add(key);
  rows.push(normalized);
}
for(const it of inputs){
  const j = it.json;
  if(Array.isArray(j?.items)){ for(const r of j.items) pushRecord(r); continue; }
  if(Array.isArray(j)){ for(const group of j){ if(Array.isArray(group?.items)) for(const r of group.items) pushRecord(r); } continue; }
  if(j && typeof j==='object'){ pushRecord(j); }
}
return rows.map(r=>({json:r}));
            `.trim();
        }

        function generateWorkflowJson() {
            const name = document.getElementById('agentName').value.trim();
            const path = document.getElementById('agentPath').value.replace(/^\/+|\/+$/g, '');
            const table = "sustainability_records"; const insertToDb = true; const mimeTypes = "application/pdf,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel";
            const docPrompt = document.getElementById('documentPrompt').value;
            const systemMessage = document.getElementById('systemMessage').value;
            const userMessage = document.getElementById('userMessage').value;
            
            if (!name) throw new Error('Agent name is required');
            if (!docPrompt) throw new Error('Document tool prompt is required');

            let schema;
            try {
                schema = JSON.parse(document.getElementById('jsonSchema').value);
            } catch (e) {
                throw new Error('Invalid JSON schema: ' + e.message);
            }

            const { id: geminiId, name: geminiName } = parseCredentialPair(document.getElementById('geminiCreds').value);
            const { id: azureId, name: azureName } = parseCredentialPair(document.getElementById('azureCreds').value);

            // Generate all node IDs
            const webhookId = generateNodeId('wh');
            const fanOutId = generateNodeId('fan');
            const uploadId = generateNodeId('up');
            const agentId = generateNodeId('agent');
            const azureChatId = generateNodeId('azure');
            const toolId = generateNodeId('tool');
            const jsonId = generateNodeId('json');
            const finalId = generateNodeId('final');
            const insertId = generateNodeId('sql');
            const outputTextId = generateNodeId('txt');
            const codeId = generateNodeId('ok');
            const respondId = generateNodeId('resp');

            const nodes = [
                {
                    id: webhookId,
                    type: "n8n-nodes-base.webhook",
                    typeVersion: 2.1,
                    position: [-2160, 64],
                    name: "Webhook",
                    parameters: {
                        httpMethod: "POST",
                        path: path,
                        responseMode: "responseNode",
                        options: {
                            allowedOrigins: "http://localhost:8080",
                            binaryPropertyName: "data",
                            rawBody: false
                        }
                    }
                },
                {
                    id: fanOutId,
                    type: "n8n-nodes-base.code",
                    typeVersion: 2,
                    position: [-1824, 64],
                    name: "Multiple_Files_Extraction",
                    parameters: {
                        jsCode: generateFanOutCode(mimeTypes)
                    }
                },
                {
                    id: uploadId,
                    type: "@n8n/n8n-nodes-langchain.googleGemini",
                    typeVersion: 1,
                    position: [-1504, 64],
                    name: "Upload a file",
                    parameters: {
                        resource: "file",
                        inputType: "binary",
                        binaryPropertyName: "=pdf"
                    },
                    credentials: {
                        googlePalmApi: {
                            id: geminiId,
                            name: geminiName
                        }
                    }
                },
                {
                    id: agentId,
                    type: "@n8n/n8n-nodes-langchain.agent",
                    typeVersion: 2.1,
                    position: [-1184, 64],
                    name: name,
                    parameters: {
                        promptType: "define",
                        text: `={{ $json.fileUri }}\\n\\n${userMessage}`,
                        options: {
                            systemMessage: systemMessage
                        }
                    }
                },
                {
                    id: azureChatId,
                    type: "@n8n/n8n-nodes-langchain.lmChatAzureOpenAi",
                    typeVersion: 1,
                    position: [-1184, 304],
                    name: "Azure OpenAI Chat Model",
                    parameters: {
                        model: "o4-mini",
                        options: {}
                    },
                    credentials: {
                        azureOpenAiApi: {
                            id: azureId,
                            name: azureName
                        }
                    }
                },
                {
                    id: toolId,
                    type: "@n8n/n8n-nodes-langchain.googleGeminiTool",
                    typeVersion: 1,
                    position: [-1184, 464],
                    name: "Analyze document (tool)",
                    parameters: {
                        resource: "document",
                        modelId: {
                            "__rl": true,
                            "value": "models/gemini-2.5-pro",
                            "mode": "list",
                            "cachedResultName": "models/gemini-2.5-pro"
                        },
                        text: docPrompt,
                        documentUrls: "={{ $json.fileUri }}",
                        options: {}
                    },
                    credentials: {
                        googlePalmApi: {
                            id: geminiId,
                            name: geminiName
                        }
                    }
                },
                {
                    id: jsonId,
                    type: "n8n-nodes-base.code",
                    typeVersion: 2,
                    position: [-768, 64],
                    name: "JSON",
                    parameters: {
                        jsCode: generateJsonScrubberCode()
                    }
                },
                {
                    id: finalId,
                    type: "n8n-nodes-base.code",
                    typeVersion: 2,
                    position: [-432, 64],
                    name: "Final_JSON",
                    parameters: {
                        jsCode: generateFinalJsonMapperCode()
                    }
                },
                {
                    id: outputTextId,
                    type: "n8n-nodes-base.code",
                    typeVersion: 2,
                    position: [-144, -112],
                    name: "Output_Text",
                    parameters: {
                        jsCode: `const items=$input.all().map(i=>i.json);return [{json:{output:JSON.stringify(items,null,2)}}];`
                    }
                },
                {
                    id: codeId,
                    type: "n8n-nodes-base.code",
                    typeVersion: 2,
                    position: [112, -112],
                    name: "Code",
                    parameters: {
                        jsCode: `console.log("success"); return [{ json:{ output: "success" } }];`
                    }
                },
                {
                    id: respondId,
                    type: "n8n-nodes-base.respondToWebhook",
                    typeVersion: 1.4,
                    position: [416, -112],
                    name: "Respond to Webhook",
                    parameters: {
                        respondWith: "text",
                        responseBody: "={{ $json.output }}",
                        options: {
                            responseCode: 200
                        }
                    }
                }
            ];
            
            if (insertToDb) {
                nodes.push({
                    id: insertId,
                    type: "n8n-nodes-base.mySql",
                    typeVersion: 2.5,
                    position: [-64, 272],
                    name: "Insert rows in a table",
                    parameters: {
                        table: table || "sustainability_records",
                        options: {
                            detailedOutput: true
                        }
                    },
                    credentials: {
                        mySql: {
                            id: "1J7io0mDCBiP2OHd",
                            name: "MySQL account"
                        }
                    }
                });
            }

            const connections = {};
            connections[`Webhook`] = { main: [[{ node: "Multiple_Files_Extraction", type: "main", index: 0 }]] };
            connections[`Multiple_Files_Extraction`] = { main: [[{ node: "Upload a file", type: "main", index: 0 }]] };
            connections[`Upload a file`] = { main: [[{ node: name, type: "main", index: 0 }]] };
            connections[`Azure OpenAI Chat Model`] = { ai_languageModel: [[{ node: name, type: "ai_languageModel", index: 0 }]] };
            connections[`Analyze document (tool)`] = { ai_tool: [[{ node: name, type: "ai_tool", index: 0 }]] };
            connections[name] = { main: [[{ node: "JSON", type: "main", index: 0 }]] };
            connections[`JSON`] = { main: [[{ node: "Final_JSON", type: "main", index: 0 }]] };
            
            if (insertToDb) {
                connections[`Final_JSON`] = { main: [[{ node: "Output_Text", type: "main", index: 0 }, { node: "Insert rows in a table", type: "main", index: 0 }]] };
            } else {
                connections[`Final_JSON`] = { main: [[{ node: "Output_Text", type: "main", index: 0 }]] };
            }
            
            connections[`Output_Text`] = { main: [[{ node: "Code", type: "main", index: 0 }]] };
            connections[`Code`] = { main: [[{ node: "Respond to Webhook", type: "main", index: 0 }]] };

            return {
                name: `Custom Agent – ${name}`,
                settings: {},
                nodes,
                connections
            };
        }
async function createCustomAgent() {
  const btn = document.getElementById('createAgentBtn');
  const results = document.getElementById('agentResults');
  try {
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating Workflow...';

    const name = document.getElementById('agentName').value.trim();
    const path = document.getElementById('agentPath').value.trim();
    const mime_types = ['application/pdf','text/csv','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-excel'];
    const document_prompt = (document.getElementById('documentPrompt')?.value || '').trim();
    const system_message = (document.getElementById('systemMessage')?.value || '').trim();
    const user_message = (document.getElementById('userMessage')?.value || '').trim();
    const json_schema = (document.getElementById('jsonSchema')?.value || '').trim();
    const insert_to_db = true;

    if (!name || !path) throw new Error('Agent Name and Webhook Path are required');

    const resp = await fetch('http://localhost:8081/py-agents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name, path, mime_types, document_prompt, system_message, user_message, json_schema, insert_to_db
      })
    });

    const data = await resp.json();
    if (!resp.ok || !data.ok) throw new Error(data.error || ('HTTP ' + resp.status));

    // Show the new Python endpoint (invoke_url)
    results.style.display = 'block';
    results.innerHTML = `
      <div class="result-item">
        <div class="result-label">Python Agent Endpoint</div>
        <div class="result-value"><code>http://localhost:8081${data.agent.invoke_url}</code></div>
      </div>
    `;

  } catch (err) {
    console.error(err);
    alert('Failed to create agent: ' + (err.message || err));
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-robot"></i> Create & Activate Workflow';
  }
}


        function previewWorkflowJson() {
            const results = document.getElementById('agentResults');
            
            try {
                const workflowData = generateWorkflowJson();
                results.innerHTML = `
                    <div style="background: #ffffff; border-radius: 12px; padding: 30px; border: 1px solid #e5e7eb; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
                        <div style="text-align: center; margin-bottom: 20px;">
                            <h3 style="color: #06402B; font-size: 24px; font-weight: 700;">Workflow JSON Preview</h3>
                        </div>
                        <div style="background: #1f2937; color: #f9fafb; border-radius: 8px; padding: 20px; font-family: 'Monaco', 'Menlo', monospace; font-size: 13px; line-height: 1.5; overflow: auto; max-height: 500px;">
                            ${escapeHtml(JSON.stringify(workflowData, null, 2))}
                        </div>
                    </div>
                `;
            } catch (error) {
                results.innerHTML = `
                    <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 12px; padding: 20px;">
                        <div style="color: #dc2626; display: flex; align-items: center;">
                            <i class="fas fa-exclamation-triangle" style="margin-right: 10px;"></i>
                            <strong>Error:</strong> ${error.message}
                        </div>
                    </div>
                `;
            }
        }

        // Data Verification Functions
        async function loadVerificationData() {
            const loadBtn = document.getElementById('loadDataBtn');
            const loadingContainer = document.getElementById('loadingContainer');
            const tableContainer = document.getElementById('dataTableContainer');
            const statusEl = document.getElementById('connectionStatus');
            const webhookUrl = document.getElementById('webhookUrl').value || CONFIG.DATA_VERIFICATION_WEBHOOK;

            try {
                loadBtn.disabled = true;
                loadingContainer.classList.add('active');
                tableContainer.classList.remove('active');
                statusEl.textContent = 'Connecting to database...';
                statusEl.style.color = 'var(--primary)';

                const response = await fetch(webhookUrl, {
                    method: 'GET',
                    headers: {
                        'Authorization': CONFIG.AUTH_TOKEN
                    }
                });

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }

                const data = await response.json();

                if (Array.isArray(data)) {
                    allData = data;
                } else if (data && Array.isArray(data.data)) {
                    allData = data.data;
                } else if (data && typeof data === 'object') {
                    allData = [data];
                } else {
                    allData = [];
                }

                allData = allData.map(record => ({
                    ...record,
                    updated_at: record.updated_at ?? record.updatedAt ?? null
                }));

                filteredData = [...allData];
                totalRecords = filteredData.length;
                totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));
                currentPage = 1;

                renderTable();
                statusEl.textContent = `Connected successfully - ${totalRecords} records found`;
                statusEl.style.color = '#22c55e';
                tableContainer.classList.add('active');
                showToast(`Loaded ${totalRecords} records successfully`);

            } catch (error) {
                console.error('Load error:', error);
                statusEl.textContent = 'Failed to connect to database';
                statusEl.style.color = '#ef4444';
                showToast('Failed to load data: ' + error.message, 'error');
            } finally {
                loadBtn.disabled = false;
                loadingContainer.classList.remove('active');
            }
        }

        function renderTable() {
            const thead = document.getElementById('tableHeader');
            const tbody = document.getElementById('tableBody');
            
            thead.innerHTML = '';
            tbody.innerHTML = '';

            if (filteredData.length === 0) {
                thead.innerHTML = '<tr><th>No Data Available</th></tr>';
                tbody.innerHTML = '<tr><td style="text-align: center; padding: 2rem; color: #6b7280;">No records available</td></tr>';
                updatePaginationInfo();
                return;
            }

            const columns = Object.keys(filteredData[0]);
            thead.innerHTML = '<tr>' + columns.map(col => 
                `<th>${escapeHtml(col.replace(/_/g, ' ').toUpperCase())}</th>`
            ).join('') + '</tr>';

            const startIndex = (currentPage - 1) * pageSize;
            const endIndex = Math.min(startIndex + pageSize, totalRecords);
            const pageItems = filteredData.slice(startIndex, endIndex);

            const rowsHtml = pageItems.map(row => {
                const trAttrs = `data-row-id="${row.id}" data-updated-at="${row.updated_at ?? ''}"`;
                const cells = columns.map(col => {
                    const value = row[col];
                    const isEditable = Object.prototype.hasOwnProperty.call(CONFIG.EDITABLE_COLUMNS, col);
                    const cellClass = isEditable ? 'editable cell-ellipsis' : 'cell-ellipsis';
                    const dataCol = isEditable ? ` data-col="${col}"` : '';
                    const title = value == null ? '' : String(value);
                    
                    return `<td class="${cellClass}"${dataCol} title="${escapeHtml(title)}">${escapeHtml(title)}</td>`;
                }).join('');
                
                return `<tr ${trAttrs}>${cells}</tr>`;
            }).join('');

            tbody.innerHTML = rowsHtml;
            updatePaginationInfo();
            enableInlineEditing();
        }

        function updatePaginationInfo() {
            const startIndex = (currentPage - 1) * pageSize;
            const endIndex = Math.min(startIndex + pageSize, totalRecords);
            
            document.getElementById('recordsInfo').textContent = 
                `Showing ${totalRecords > 0 ? startIndex + 1 : 0}-${endIndex} of ${totalRecords} records`;
            document.getElementById('pageIndicator').textContent = `${currentPage} / ${totalPages}`;
            
            document.getElementById('firstPageBtn').disabled = currentPage <= 1;
            document.getElementById('prevPageBtn').disabled = currentPage <= 1;
            document.getElementById('nextPageBtn').disabled = currentPage >= totalPages;
            document.getElementById('lastPageBtn').disabled = currentPage >= totalPages;
        }

        function changePageSize(newSize) {
            pageSize = parseInt(newSize, 10) || 25;
            totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));
            currentPage = 1;
            renderTable();
        }

        function goToFirstPage() {
            currentPage = 1;
            renderTable();
        }

        function goToPreviousPage() {
            currentPage = Math.max(1, currentPage - 1);
            renderTable();
        }

        function goToNextPage() {
            currentPage = Math.min(totalPages, currentPage + 1);
            renderTable();
        }

        function goToLastPage() {
            currentPage = totalPages;
            renderTable();
        }

        function enableInlineEditing() {
            const table = document.getElementById('dataTable');
            if (!table) return;

            table.querySelectorAll('td.editable').forEach(td => {
                td.addEventListener('click', () => {
                    if (td.querySelector('input, textarea')) return;
                    startCellEdit(td);
                });
            });
        }

        function startCellEdit(td) {
            const column = td.dataset.col;
            const rule = CONFIG.EDITABLE_COLUMNS[column];
            if (!rule) return;

            const originalValue = td.textContent.trim();
            const isLongText = rule.type === 'string' && rule.max && rule.max > 120;
            
            const input = isLongText ? document.createElement('textarea') : document.createElement('input');
            
            if (rule.type === 'number') {
                input.type = 'number';
                if (rule.min !== undefined) input.min = rule.min;
                if (rule.integer) input.step = '1';
            }
            
            input.value = originalValue;
            input.dataset.originalValue = originalValue;
            input.style.width = '100%';
            input.style.boxSizing = 'border-box';
            input.style.padding = '0.5rem';
            input.style.border = '2px solid #06402B';
            input.style.borderRadius = '4px';

            td.innerHTML = '';
            td.appendChild(input);
            input.focus();
            input.select();

            const saveEdit = async () => {
                if (input.value !== originalValue) {
                    await saveCellEdit(td, input.value);
                } else {
                    td.textContent = originalValue;
                }
            };

            input.addEventListener('keydown', async (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    await saveEdit();
                } else if (e.key === 'Escape') {
                    td.textContent = originalValue;
                }
            });

            input.addEventListener('blur', saveEdit);
        }

        function coerceAndValidate(rawValue, rule) {
            if (!rule) return { ok: true, value: rawValue };

            if (rule.type === 'number') {
                const num = Number(rawValue);
                if (Number.isNaN(num)) return { ok: false, message: 'Must be a number' };
                if (rule.integer && !Number.isInteger(num)) return { ok: false, message: 'Must be an integer' };
                if (rule.min !== undefined && num < rule.min) return { ok: false, message: `Must be ≥ ${rule.min}` };
                return { ok: true, value: num };
            }

            const str = String(rawValue ?? '').trim();
            if (rule.max && str.length > rule.max) return { ok: false, message: `Max length ${rule.max}` };
            return { ok: true, value: str };
        }

        async function saveCellEdit(td, newRawValue) {
            const tr = td.closest('tr');
            const id = tr?.dataset?.rowId;
            const column = td.dataset.col;
            const rule = CONFIG.EDITABLE_COLUMNS[column];
            const previousValue = (td.querySelector('input, textarea')?.dataset.originalValue ?? '').trim();
            const updatedAt = tr?.dataset?.updatedAt || null;

            const { ok, value, message } = coerceAndValidate(newRawValue, rule);
            
            if (!ok) {
                showToast(message || 'Invalid value', 'error');
                td.textContent = previousValue;
                return;
            }

            if (String(value) === String(previousValue)) {
                td.textContent = previousValue;
                return;
            }

            td.classList.add('saving');
            td.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';

            try {
                const webhookUrl = CONFIG.DATA_VERIFICATION_UPDATE_WEBHOOK;
                const response = await fetch(webhookUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': CONFIG.AUTH_TOKEN
                    },
                    body: JSON.stringify({
                        id: id,
                        column: column,
                        newValue: value,
                        previousValue: previousValue,
                        updatedAt: updatedAt
                    })
                });

                const result = await response.json().catch(() => ({}));

                if (!response.ok || !result.ok) {
                    throw new Error(result.error || `Update failed (${response.status})`);
                }

                td.textContent = String(value);
                showToast('Changes saved successfully');

                const dataIndex = allData.findIndex(record => String(record.id) === String(id));
                if (dataIndex > -1) {
                    allData[dataIndex][column] = value;
                    filteredData[dataIndex][column] = value;
                }

            } catch (error) {
                console.error('Save error:', error);
                td.textContent = previousValue;
                showToast('Failed to save: ' + error.message, 'error');
            } finally {
                td.classList.remove('saving');
            }
        }

        // Dataset Upload and Emission Calculation Functions
        document.getElementById('datasetUploadForm').addEventListener('submit', async function(e) {
            e.preventDefault();
            const webhookUrl = document.getElementById('datasetWebhookUrl').value.trim();
            const file = document.getElementById('datasetFileInput').files[0];
            if (!webhookUrl) return showStatus('Please enter a dataset webhook URL.', 'error', 'datasetStatusMessage');
            if (!file) return showStatus('Please select a dataset file.', 'error', 'datasetStatusMessage');

            const submitButton = document.getElementById('datasetSubmitButton');
            submitButton.innerHTML = '<span class="loading-spinner"></span>Uploading...';
            submitButton.disabled = true;
            showStatus('Uploading dataset...', 'info', 'datasetStatusMessage');
            document.getElementById('emissionCalculationSection').style.display = 'none';
            extractedDatasetFilename = null;
            
            const startTime = Date.now();
            
            const formData = new FormData();
            formData.append('file_0', file);
            formData.append('filename_0', file.name);
            formData.append('file_count', '1');
            formData.append('filenames_json', JSON.stringify([file.name]));

            try {
                const response = await fetch(webhookUrl, {
                    method: 'POST', 
                    body: formData
                });
                const responseData = await response.json();
                displayApiResponse(responseData, 'dataset', startTime);

                if (response.ok && responseData.output === 'success' && responseData.filename) {
                    showStatus('Dataset uploaded successfully. Ready for calculation.', 'success', 'datasetStatusMessage');
                    const filenameWithExt = responseData.filename;
                    const lastDotIndex = filenameWithExt.lastIndexOf('.');
                    extractedDatasetFilename = lastDotIndex === -1 ? filenameWithExt : filenameWithExt.substring(0, lastDotIndex);
                    document.getElementById('emissionCalculationSection').style.display = 'block';
                } else {
                    throw new Error(responseData.message || 'Upload was not successful or filename missing in response.');
                }
            } catch (error) {
                displayApiResponse({ success: false, error: error.message }, 'dataset', startTime);
                showStatus(`Upload failed: ${error.message}`, 'error', 'datasetStatusMessage');
            } finally {
                submitButton.innerHTML = 'Upload Dataset';
                submitButton.disabled = false;
            }
        });

        document.getElementById('calculateEmissionButton').addEventListener('click', async function() {
            if (!extractedDatasetFilename) {
                return showStatus('No valid dataset filename available for calculation.', 'error', 'calculationStatusMessage');
            }
            const calculationWebhookUrl = 'http://localhost:5678/webhook/ecalc';
            
            const calcButton = this;
            calcButton.innerHTML = '<span class="loading-spinner"></span>Calculating...';
            calcButton.disabled = true;
            showStatus('Sending request for calculation...', 'info', 'calculationStatusMessage');
            
            const startTime = Date.now();
            
            try {
                const response = await fetch(calculationWebhookUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ input: extractedDatasetFilename })
                });

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const responseData = await response.json();
                displayApiResponse(responseData, 'calculation', startTime);
                showStatus('Calculation request completed.', 'success', 'calculationStatusMessage');
            } catch (error) {
                const errorData = { success: false, error: error.message };
                displayApiResponse(errorData, 'calculation', startTime);
                showStatus(`Calculation failed: ${error.message}`, 'error', 'calculationStatusMessage');
            } finally {
                calcButton.innerHTML = 'Calculate Emission Factor';
                calcButton.disabled = false;
            }
        });

        // Generic Status Function
        function showStatus(message, type, elementId) {
            const statusEl = document.getElementById(elementId);
            if (!statusEl) return;
            statusEl.textContent = message;
            statusEl.className = `status-message status-${type}`;
            statusEl.style.display = 'block';
            setTimeout(() => {
                statusEl.style.display = 'none';
            }, 5000);
        }

        // Response Handling Functions
        function switchTab(event, tabId) {
            const container = event.target.closest('.response-container');
            container.querySelectorAll('.response-tab').forEach(tab => tab.classList.remove('active'));
            container.querySelectorAll('.response-panel').forEach(panel => panel.classList.remove('active'));
            event.target.classList.add('active');
            container.querySelector(`#${tabId}`).classList.add('active');
        }

        function copyResponse(responseType) {
            const textToCopy = apiResponses[responseType] ? JSON.stringify(apiResponses[responseType], null, 2) : '';
            if (textToCopy) {
                navigator.clipboard.writeText(textToCopy).then(() => showToast('Response copied to clipboard!'));
            }
        }

        function clearResponse(sectionId) {
            const section = document.getElementById(sectionId);
            section.style.display = 'none';
            
            let type;
            if (sectionId === 'datasetResponseSection') type = 'dataset';
            else if (sectionId === 'calculationResponseSection') type = 'calculation';
            else if (sectionId === 'emissionResponseSection') type = 'emission';

            if (type) {
                apiResponses[type] = null;
                resetResponseDisplay(type);
            }
        }

        function resetResponseDisplay(type) {
            document.getElementById(`${type}ResponseFormatted`).innerHTML = 'No response yet.';
            document.getElementById(`${type}ResponseRaw`).textContent = 'No response yet.';
            document.getElementById(`${type}MetaStatus`).textContent = '-';
            document.getElementById(`${type}MetaTime`).textContent = '-';
            document.getElementById(`${type}MetaType`).textContent = '-';
            document.getElementById(`${type}MetaSize`).textContent = '-';
        }

        function displayApiResponse(responseData, type, startTime) {
            const endTime = Date.now();
            apiResponses[type] = responseData;
            
            document.getElementById(`${type}ResponseSection`).style.display = 'block';
            document.getElementById(`${type}ResponseFormatted`).innerHTML = formatResponse(responseData);
            document.getElementById(`${type}ResponseRaw`).textContent = JSON.stringify(responseData, null, 2);
            document.getElementById(`${type}MetaStatus`).textContent = (responseData.success === true || responseData.output === 'success') ? 'Success' : 'Error';
            document.getElementById(`${type}MetaTime`).textContent = `${endTime - startTime}ms`;
            document.getElementById(`${type}MetaType`).textContent = 'application/json';
            document.getElementById(`${type}MetaSize`).textContent = `${JSON.stringify(responseData).length} bytes`;
        }

        function formatResponse(data) {
            if (!data) return 'No response data';
            let html = '<div style="font-family: inherit;">';
            const isSuccess = data.success === true || data.output === 'success';
            html += `<div style="color: ${isSuccess ? '#059669' : '#dc2626'}; font-weight: 600; margin-bottom: 15px;">${isSuccess ? '✅ Success' : '❌ Error'}</div>`;
            if (data.message) html += `<div style="margin-bottom: 15px;"><strong>Message:</strong> ${data.message}</div>`;
            
            html += '<pre style="white-space: pre-wrap; word-break: break-all; background: #f8fafc; padding: 15px; border-radius: 8px;">' + JSON.stringify(data, null, 2) + '</pre>';

            if (data.error) html += `<div style="color: #dc2626; margin-bottom: 15px; margin-top: 15px;"><strong>Error:</strong> ${data.error}</div>`;
            html += '</div>';
            return html;
        }

        // Emission Prompts Function
        async function submitEmissionPrompts() {
            const webhookUrl = document.getElementById('emissionWebhookUrl').value.trim();
            const prompts = document.getElementById('emissionPrompts').value.trim();
            if (!webhookUrl) return showStatus('Please provide a webhook URL.', 'error', 'emissionStatusMessage');
            if (!prompts) return showStatus('Please enter emission prompts.', 'error', 'emissionStatusMessage');
            
            showStatus('Updating...', 'info', 'emissionStatusMessage');
            const startTime = Date.now();
            
            try {
                const response = await fetch(webhookUrl, { 
                    method: 'POST', 
                    body: JSON.stringify({ prompts }), 
                    headers: {'Content-Type': 'application/json'} 
                });
                const responseData = await response.json();
                displayApiResponse(responseData, 'emission', startTime);
                showStatus('Updated successfully!', 'success', 'emissionStatusMessage');
            } catch(e) {
                displayApiResponse({success: false, error: e.message}, 'emission', startTime);
                showStatus('Update failed!', 'error', 'emissionStatusMessage');
            }
        }

        // Sustainability Reporting Functions
        (function initReporting() {
            const btnGenerate = document.getElementById('btnGenerateReport');
            const btnDownload = document.getElementById('btnDownloadReport');
            const inputUrl = document.getElementById('n8nWebhookUrl');
            const statusEl = document.getElementById('reportStatus');
            const iframe = document.getElementById('reportIframe');
            const empty = document.getElementById('reportEmptyState');

            let latestBlobUrl = null;
            let latestFilename = 'ESG_Report.html';

            function setBusy(busy) {
                if (busy) {
                    btnGenerate.setAttribute('disabled', 'true');
                    btnGenerate.classList.add('loading');
                    statusEl.textContent = 'Generating report...';
                } else {
                    btnGenerate.removeAttribute('disabled');
                    btnGenerate.classList.remove('loading');
                }
            }

            async function generateReport() {
                const url = (inputUrl && inputUrl.value) ? inputUrl.value.trim() : '/webhook/report';
                if (!url) {
                    showToast('Please provide a valid Webhook URL', 'warning');
                    return;
                }
                
                setBusy(true);
                btnDownload.setAttribute('disabled', 'true');
                
                try {
                    const res = await fetch(url, { method: 'GET' });
                    if (!res.ok) {
                        throw new Error('HTTP ' + res.status + ' - ' + (await res.text()).slice(0, 200));
                    }
                    
                    const contentType = res.headers.get('Content-Type') || 'text/html; charset=utf-8';
                    let filename = 'ESG_Report.html';
                    const dispo = res.headers.get('Content-Disposition');
                    if (dispo) {
                        const m = /filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i.exec(dispo);
                        if (m) { 
                            filename = decodeURIComponent(m[1] || m[2]); 
                        }
                    }
                    latestFilename = filename;

                    const text = await res.text();
                    
                    // Render in viewer
                    iframe.srcdoc = text;
                    iframe.style.display = 'block';
                    empty.style.display = 'none';

                    // Prepare download
                    if (latestBlobUrl) URL.revokeObjectURL(latestBlobUrl);
                    const blob = new Blob([text], { type: contentType });
                    latestBlobUrl = URL.createObjectURL(blob);
                    btnDownload.removeAttribute('disabled');

                    statusEl.textContent = 'Report generated successfully.';
                    showToast('Report ready');
                    
                } catch (err) {
                    console.error(err);
                    statusEl.textContent = 'Failed to generate report.';
                    showToast('Failed to generate report: ' + err.message, 'error');
                } finally {
                    setBusy(false);
                }
            }

            function downloadReport() {
                if (!latestBlobUrl) return;
                const a = document.createElement('a');
                a.href = latestBlobUrl;
                a.download = latestFilename;
                document.body.appendChild(a);
                a.click();
                a.remove();
            }

            if (btnGenerate) { 
                btnGenerate.addEventListener('click', generateReport); 
            }
            if (btnDownload) { 
                btnDownload.addEventListener('click', downloadReport); 
            }
        })();

        // Initialize
        document.addEventListener('DOMContentLoaded', function() {
            // Set default active navigation
            document.querySelector('.nav-link').classList.add('active');
            
            // Auto-generate agent path when name changes
            updateAgentPath();
            
            showToast('SustainIQ Dashboard loaded successfully');
        });
    
document.addEventListener('DOMContentLoaded', () => {
  for (const id of ['n8nBaseUrl','n8nApiKey']) {
    const el = document.getElementById(id);
    if (el && el.closest('.form-group')) {
      el.closest('.form-group').style.display = 'none';
    }
  }
});


async function loadCustomAgents() {
  try {
    const res = await fetch('http://localhost:8081/py-agents');
    const data = await res.json();
    const sel = document.getElementById('customAgentsMulti');
    if (!sel) return;
    sel.innerHTML = '';
    if (data.ok && Array.isArray(data.agents)) {
      for (const a of data.agents) {
        const opt = document.createElement('option');
        opt.value = a.slug;
        opt.textContent = `${a.name} (/py-agents/${a.slug})`;
        opt.dataset.invoke = `http://localhost:8081/py-agents/${a.slug}`;
        sel.appendChild(opt);
      }
    }
  } catch (e) {
    console.warn('Failed to load custom agents', e);
  }
}

function getSelectedCustomAgents() {
  const sel = document.getElementById('customAgentsMulti');
  if (!sel) return [];
  return Array.from(sel.selectedOptions).map(opt => ({
    slug: opt.value,
    name: opt.textContent,
    url: opt.dataset.invoke
  }));
}

function appendCustomAgentStatusItems(selected) {
  const container = document.getElementById('apiStatus');
  if (!container) return;
  for (const a of selected) {
    const id = `custom_${a.slug}`;
    if (document.getElementById(id)) continue;
    const div = document.createElement('div');
    div.className = 'api-item';
    div.id = id;
    div.innerHTML = `<span class="api-name">Custom Agent (${a.slug})</span><span class="api-status-text">Waiting...</span>`;
    container.appendChild(div);
  }
}

function cloneFormData(fd) {
  const fd2 = new FormData();
  for (const [k,v] of fd.entries()) {
    fd2.append(k, v);
  }
  return fd2;
}

document.addEventListener('DOMContentLoaded', () => {
  loadCustomAgents();
  const btn = document.getElementById('refreshAgentsBtn');
  if (btn) btn.addEventListener('click', () => loadCustomAgents());
});


document.addEventListener('DOMContentLoaded', () => {
  try {
    if (!document.getElementById('customAgentsPicker')) {
      const apiStatus = document.getElementById('apiStatus');
      if (apiStatus && apiStatus.parentElement) {
        const wrapper = document.createElement('div');
        wrapper.id = 'customAgentsPicker';
        wrapper.className = 'files-preview';
        wrapper.style.marginTop = '10px';
        wrapper.innerHTML = `
          <h4 style="font-size: 16px; font-weight:600; margin-bottom: 8px;">Select Custom Python Agents (optional)</h4>
          <div style="display:flex; gap:12px; align-items:center; flex-wrap:wrap;">
            <select id="customAgentsMulti" multiple size="4" style="min-width: 320px; max-width: 520px; padding:8px; border:1px solid #e5e7eb; border-radius:8px;"></select>
            <button type="button" class="submit-button" id="refreshAgentsBtn2" style="width:auto; padding:8px 12px;">Refresh</button>
            <span id="customAgentsHint" style="color:#6b7280;">Hold Ctrl/Cmd to select multiple</span>
          </div>
        `;
        apiStatus.parentElement.insertBefore(wrapper, apiStatus);
      }
    }
  } catch (e) { /* noop */ }
});


document.addEventListener('DOMContentLoaded', () => {
  const altBtn = document.getElementById('refreshAgentsBtn2');
  if (altBtn) altBtn.addEventListener('click', () => loadCustomAgents());
});


function renderCustomAgentContexts() {
  const grid = document.getElementById('customAgentsContextsGrid');
  const wrap = document.getElementById('customAgentsContexts');
  if (!grid || !wrap) return;
  const selected = getSelectedCustomAgents();
  grid.innerHTML = '';
  if (!selected.length) { wrap.style.display = 'none'; return; }
  wrap.style.display = 'block';
  for (const a of selected) {
    const card = document.createElement('div');
    card.style.border = '1px solid #e5e7eb';
    card.style.borderRadius = '10px';
    card.style.padding = '10px';
    card.style.background = '#fff';
    card.innerHTML = `
      <div style="font-weight:600; margin-bottom:6px;">${a.name}</div>
      <textarea id="ctx_${a.slug}" placeholder="Optional notes/context for ${a.slug}..." 
        style="width:100%; min-height:90px; padding:8px; border:1px solid #e5e7eb; border-radius:8px;"></textarea>
    `;
    grid.appendChild(card);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const sel = document.getElementById('customAgentsMulti');
  if (sel) {
    sel.addEventListener('change', renderCustomAgentContexts);
  }
  // re-render contexts after agents load/refresh
  const btn1 = document.getElementById('refreshAgentsBtn');
  if (btn1) btn1.addEventListener('click', () => setTimeout(renderCustomAgentContexts, 300));
  const btn2 = document.getElementById('refreshAgentsBtn2');
  if (btn2) btn2.addEventListener('click', () => setTimeout(renderCustomAgentContexts, 300));
});

/* sustainiq_dynamic_schema.js
   Output JSON Schema — attractive dropdown UI with search + chips.
   - Hides old #jsonSchema textarea (kept as hidden source of truth).
   - Populates columns from /py-agents/table-columns.
   - Lets users add custom columns.
   - Keeps hidden #jsonSchema synced as { items: [ { col: null, ... } ] }.
   - Patches createCustomAgent() to include new_columns in POST.
*/

(function () {
  var TABLE = 'sustainability_records';
  var FETCH_URL =
    'http://localhost:8081/py-agents/table-columns?table=' + encodeURIComponent(TABLE);

  // --- tiny utils ---
  function onReady(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }
  function sanitize(name) {
    return (name || '')
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_')
      .replace(/^_+|_+$/g, '');
  }
  function uniq(arr) {
    var s = {}; var out = [];
    for (var i = 0; i < arr.length; i++) { if (!s[arr[i]]) { s[arr[i]] = 1; out.push(arr[i]); } }
    return out;
  }
  function fetchColumns(cb) {
    fetch(FETCH_URL)
      .then(function (r) { if (!r.ok) throw new Error('columns fetch failed'); return r.json(); })
      .then(function (j) { if (!j || !j.ok) throw new Error('bad response'); cb(j.columns || []); })
      .catch(function () { cb(['category', 'date', 'service_type', 'fuel_type']); });
  }
  function makeSchema(cols) {
    var obj = {};
    for (var i = 0; i < cols.length; i++) obj[cols[i]] = null;
    return JSON.stringify({ items: [obj] }, null, 2);
  }

  // --- styles (scoped) ---
  function injectStylesOnce() {
    if (document.getElementById('schemaStyles')) return;
    var css = document.createElement('style');
    css.id = 'schemaStyles';
    css.textContent =
      ".schema-card{background:linear-gradient(180deg,#0f5132 0%,#0b3d25 100%);border:1px solid #164b35;border-radius:14px;padding:16px;color:#e9f5ef;box-shadow:0 6px 16px rgba(0,0,0,.2);margin-top:.75rem}" +
      ".schema-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:.5rem}" +
      ".schema-title{font-weight:700;letter-spacing:.3px}" +
      ".schema-secondary{opacity:.85}" +
      ".schema-chips{display:flex;flex-wrap:wrap;gap:.4rem;margin:.5rem 0 .25rem}" +
      ".schema-chip{background:#e9f5ef;color:#0b3d25;border-radius:999px;padding:.25rem .6rem;font-size:.85rem;border:1px solid #b6e2cf}" +
      ".schema-row{display:flex;gap:.5rem;align-items:center;margin-top:.6rem}" +
      ".schema-input{flex:1;border:1px solid #1f6d4c;background:#0c2f20;color:#e9f5ef;border-radius:10px;padding:.5rem .75rem;outline:none}" +
      ".schema-input::placeholder{color:#7bd4b0}" +
      ".schema-btn{background:#22c55e;border:none;color:white;padding:.45rem .8rem;border-radius:10px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.15)}" +
      ".schema-btn:hover{transform:translateY(-1px)}" +
      ".schema-dd{position:relative;display:inline-block}" +
      ".schema-dd-toggle{background:#10b981;border:none;color:#072a1b;padding:.45rem .8rem;border-radius:10px;cursor:pointer}" +
      ".schema-dd-panel{position:absolute;top:110%;left:0;min-width:320px;max-width:420px;max-height:320px;overflow:auto;background:#0a261a;border:1px solid #164b35;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.35);padding:10px;color:#e9f5ef;display:none;z-index:10000}" +
      ".schema-dd-panel.open{display:block}" +
      ".schema-search{width:100%;margin-bottom:.5rem;border:1px solid #165238;background:#0f3424;color:#e9f5ef;border-radius:8px;padding:.45rem .6rem}" +
      ".schema-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:.35rem}" +
      ".schema-item{background:#0f3424;border:1px solid #165238;border-radius:10px;padding:.35rem .5rem;display:flex;gap:.45rem;align-items:center}" +
      ".schema-item input{accent-color:#22c55e}";
    document.head.appendChild(css);
  }

  // --- patch create ---
  function patchCreateAgent() {
    if (window.__patchedCreateAgent) return;
    var orig = window.createCustomAgent;
    if (typeof orig !== 'function') return;
    window.createCustomAgent = async function () {
      var _fetch = window.fetch;
      window.fetch = function (url, opts) {
        try {
          if (typeof url === 'string' &&
              url.indexOf('/py-agents') !== -1 &&
              opts && opts.method === 'POST' && opts.body) {
            var body = JSON.parse(opts.body);
            body.new_columns = (window.__customNewColumns || []).slice();
            opts.body = JSON.stringify(body);
          }
        } catch (_) {}
        return _fetch.apply(this, arguments);
      };
      try { return await orig(); }
      finally { window.fetch = _fetch; }
    };
    window.__patchedCreateAgent = true;
  }

  // --- build UI ---
  function buildUI() {
    injectStylesOnce();

    var area = document.getElementById('jsonSchema');
    if (!area) return;
    if (document.getElementById('schemaCard')) return;

    // keep the old textarea as the hidden source of truth
    area.style.display = 'none';

    var block = area.parentElement.parentElement; // <div class="form-group"> parent wrapper
    var card = document.createElement('div');
    card.className = 'schema-card';
    card.id = 'schemaCard';

    var header = document.createElement('div');
    header.className = 'schema-header';

    var title = document.createElement('div');
    title.className = 'schema-title';
    title.textContent = 'Output Columns';

    var dd = document.createElement('div');
    dd.className = 'schema-dd';

    var ddToggle = document.createElement('button');
    ddToggle.className = 'schema-dd-toggle';
    ddToggle.type = 'button';
    ddToggle.textContent = 'Select Columns ▾';

    var ddPanel = document.createElement('div');
    ddPanel.className = 'schema-dd-panel';

    var search = document.createElement('input');
    search.className = 'schema-search';
    search.placeholder = 'Search columns...';

    var list = document.createElement('div');
    list.className = 'schema-list';

    ddPanel.appendChild(search);
    ddPanel.appendChild(list);
    dd.appendChild(ddToggle);
    dd.appendChild(ddPanel);

    header.appendChild(title);
    header.appendChild(dd);

    var sub = document.createElement('div');
    sub.className = 'schema-secondary';
    sub.textContent = 'Choose the columns the agent should return. You can also add custom ones.';

    var chips = document.createElement('div');
    chips.className = 'schema-chips';
    chips.id = 'schemaChips';

    var row = document.createElement('div');
    row.className = 'schema-row';
    var input = document.createElement('input');
    input.className = 'schema-input';
    input.id = 'schemaNewCol';
    input.placeholder = 'Add custom column (e.g., supplier_name)';
    var addBtn = document.createElement('button');
    addBtn.className = 'schema-btn';
    addBtn.type = 'button';
    addBtn.textContent = 'Add';

    row.appendChild(input);
    row.appendChild(addBtn);

    card.appendChild(header);
    card.appendChild(sub);
    card.appendChild(chips);
    card.appendChild(row);

    block.parentElement.insertBefore(card, block.nextSibling);

    // state
    var available = [];
    window.__customNewColumns = window.__customNewColumns || [];
    var custom = window.__customNewColumns;
    var selected = [];

    function renderChips() {
      chips.innerHTML = '';
      if (!selected.length) {
        var em = document.createElement('span');
        em.textContent = 'No columns selected';
        em.className = 'schema-secondary';
        chips.appendChild(em);
        return;
      }
      selected.forEach(function (c) {
        var sp = document.createElement('span');
        sp.className = 'schema-chip';
        sp.textContent = c;
        chips.appendChild(sp);
      });
    }

    function sync() {
      selected = uniq(selected);
      area.value = makeSchema(selected);
      renderChips();
    }

    function renderList(filter) {
      list.innerHTML = '';
      var all = uniq(available.concat(custom));
      if (filter) {
        var q = filter.toLowerCase();
        all = all.filter(function (c) { return c.indexOf(q) !== -1; });
      }
      all.forEach(function (col) {
        var item = document.createElement('label');
        item.className = 'schema-item';
        var cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.value = col;
        cb.checked = selected.indexOf(col) !== -1;
        var txt = document.createElement('span');
        txt.textContent = col;
        item.appendChild(cb);
        item.appendChild(txt);
        cb.addEventListener('change', function () {
          if (cb.checked) {
            if (selected.indexOf(col) === -1) selected.push(col);
          } else {
            selected = selected.filter(function (x) { return x !== col; });
          }
          sync();
        });
        list.appendChild(item);
      });
    }

    // events
    ddToggle.addEventListener('click', function () {
      ddPanel.classList.toggle('open');
      if (ddPanel.classList.contains('open')) {
        renderList(search.value || '');
      }
    });
    document.addEventListener('click', function (e) {
      if (!dd.contains(e.target)) ddPanel.classList.remove('open');
    });
    search.addEventListener('input', function () {
      renderList(search.value || '');
    });
    addBtn.addEventListener('click', function () {
      var raw = (input.value || '').trim();
      var col = sanitize(raw);
      if (!col) return;
      if (available.indexOf(col) === -1) available.push(col);
      if (custom.indexOf(col) === -1) custom.push(col);
      if (selected.indexOf(col) === -1) selected.push(col);
      input.value = '';
      sync();
      renderList(search.value || '');
    });

    // initial fetch + hydrate
    fetchColumns(function (cols) {
      available = cols.slice(0);
      selected = uniq(cols.concat(custom));
      sync();
    });

    // make sure POST carries new_columns
    patchCreateAgent();
  }

  function ensureInit() {
    var area = document.getElementById('jsonSchema');
    if (area && !document.getElementById('schemaCard')) buildUI();
  }

  onReady(function () {
    ensureInit();
    // survive SPA re-renders
    var mo = new MutationObserver(function () { ensureInit(); });
    mo.observe(document.body, { childList: true, subtree: true });
  });
})();
