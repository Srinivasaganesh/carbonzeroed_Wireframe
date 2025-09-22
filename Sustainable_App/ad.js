         // Configuration and global state
        const WEBHOOK_URLS = [
            'http://localhost:5678/webhook/Energy_Utilities',
            'http://localhost:5678/webhook/Water_land_Use',
            'http://localhost:5678/webhook/Fuels_and_Combustion',
            'http://localhost:5678/webhook/Mobility',
            'http://localhost:5678/webhook/Procurement_and_waste'
        ];

        const EXTRACTION_WEBHOOK_URL = 'http://localhost:5678/webhook/extraction';

        // Global state variables
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

        // Progress Functions
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
        function setupFileDrop() {
            const dropZone = document.getElementById('advancedDropZone');
            const fileInput = document.getElementById('advancedFileInput');
            
            if (!dropZone || !fileInput) return;

            dropZone.addEventListener('click', () => fileInput.click());
            dropZone.addEventListener('dragover', (e) => { 
                e.preventDefault(); 
                dropZone.classList.add('dragover'); 
            });
            dropZone.addEventListener('dragleave', (e) => { 
                e.preventDefault(); 
                dropZone.classList.remove('dragover'); 
            });
            dropZone.addEventListener('drop', (e) => {
                e.preventDefault();
                dropZone.classList.remove('dragover');
                fileInput.files = e.dataTransfer.files;
                handleFileSelection();
            });
            fileInput.addEventListener('change', handleFileSelection);
        }

        function handleFileSelection() {
            const fileInput = document.getElementById('advancedFileInput');
            const grid = document.getElementById('advancedFilesGrid');
            
            if (fileInput.files.length === 0) return;
            
            grid.innerHTML = '';
            processingResults.uploadedFilenames = [];
            
            Array.from(fileInput.files).forEach((file, index) => {
                const fileItem = createFileItem(file, index);
                grid.appendChild(fileItem);
                processingResults.uploadedFilenames.push(file.name);
            });

            // Display filenames
            const filenamesList = document.getElementById('advancedFilenamesList');
            if (filenamesList) {
                filenamesList.innerHTML = processingResults.uploadedFilenames
                    .map(name => `• ${name}`)
                    .join('<br>');
            }
            
            updateProgressStep(1, 'completed');
            document.getElementById('advancedFilesPreview').style.display = 'block';
            document.getElementById('advancedCategoriesSection').style.display = 'block';
            document.getElementById('advancedSubmitSection').style.display = 'block';
        }

        function createFileItem(file, index) {
            const div = document.createElement('div');
            div.className = 'file-item';
            const iconMap = { 
                pdf: '📄', 
                word: '📝', 
                document: '📝', 
                excel: '📊', 
                spreadsheet: '📊', 
                image: '🖼️', 
                csv: '📈' 
            };
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

        // API Functions
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

        // Custom Agents Functions
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

        function renderCustomAgentContexts() {
            const grid = document.getElementById('customAgentsContextsGrid');
            const wrap = document.getElementById('customAgentsContexts');
            if (!grid || !wrap) return;
            const selected = getSelectedCustomAgents();
            grid.innerHTML = '';
            if (!selected.length) { 
                wrap.style.display = 'none'; 
                return; 
            }
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

        // Form Handler
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

                // Build promises for 5 n8n webhooks
                const webhookPromises = WEBHOOK_URLS.map((url, index) => 
                    callApi(url, cloneFormData(formData), `webhook${index + 1}`)
                );

                // Build promises for selected Python custom agents
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

        // Initialize
        document.addEventListener('DOMContentLoaded', function() {
            setupFileDrop();
            loadCustomAgents();
            
            const refreshBtn = document.getElementById('refreshAgentsBtn');
            if (refreshBtn) {
                refreshBtn.addEventListener('click', () => loadCustomAgents());
            }
            
            const sel = document.getElementById('customAgentsMulti');
            if (sel) {
                sel.addEventListener('change', renderCustomAgentContexts);
            }
            
            showToast('Advanced Processing page loaded successfully');
        });
