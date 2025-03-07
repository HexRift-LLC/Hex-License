/**
 * Hex License - Enhanced Main JavaScript
 * Version: 2.0.0
 * Description: Core functionality for the Hex License application interface
 */

(function() {
    'use strict';

    // Application state
    const state = {
        theme: localStorage.getItem('theme') || 'dark',
        notifications: []
    };

    // DOM ready handler
    document.addEventListener('DOMContentLoaded', () => {
        initializeApp();
    });

    /**
     * Initialize all application components
     */
    function initializeApp() {
        // Core systems
        NotificationSystem.init();
        ThemeManager.init();
        
        // UI components
        Navigation.init();
        FormHandlers.init();
        
        // Feature detection and initialization
        if (isStaffPage()) {
            StaffDashboard.init();
        }
        
        if (isUserDashboard()) {
            UserDashboard.init();
        }
        
        // Initialize global UI handlers
        initCopyButtons();
        initInteractiveElements();
        
        // Analytics
        if (window.gtag) {
            logPageView();
        }
    }

    /**
     * Enhanced Notification System
     */
    const NotificationSystem = {
        container: null,
        maxNotifications: 5,
        displayDuration: 4000,
        
        init() {
            // Create notification container if it doesn't exist
            this.container = document.getElementById('notificationStack');
            
            if (!this.container) {
                this.container = document.createElement('div');
                this.container.id = 'notificationStack';
                this.container.className = 'notification-stack';
                document.body.appendChild(this.container);
            }
            
            // Expose the createNotification method globally
            window.createNotification = this.create.bind(this);
        },
        
        /**
         * Create and display a notification
         * @param {string} message - The notification message
         * @param {string} type - Type of notification (success, error, warning, info)
         * @param {number} [duration] - How long to display the notification in ms
         * @returns {HTMLElement} The notification element
         */
        create(message, type = 'success', duration = this.displayDuration) {
            // Limit maximum simultaneous notifications
            if (this.container.children.length >= this.maxNotifications) {
                // Remove oldest notification
                if (this.container.firstChild) {
                    this.container.removeChild(this.container.firstChild);
                }
            }
            
            // Create notification element
            const notification = document.createElement('div');
            notification.className = `notification ${type}`;
            
            // Select appropriate icon
            const iconClass = this.getIconForType(type);
            
            notification.innerHTML = `
                <i class="fas ${iconClass}" aria-hidden="true"></i>
                <span>${message}</span>
            `;
            
            // Add to DOM
            this.container.appendChild(notification);
            
            // Add entrance animation
            requestAnimationFrame(() => {
                notification.classList.add('visible');
            });
            
            // Set timeout for removal
            const timer = setTimeout(() => {
                this.remove(notification);
            }, duration);
            
            // Allow early dismissal
            notification.addEventListener('click', () => {
                clearTimeout(timer);
                this.remove(notification);
            });
            
            return notification;
        },
        
        /**
         * Remove a notification with animation
         * @param {HTMLElement} notification - The notification element to remove
         */
        remove(notification) {
            notification.classList.add('fadeout');
            
            // Remove from DOM after animation completes
            notification.addEventListener('animationend', () => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            });
        },
        
        /**
         * Get the appropriate icon class for notification type
         * @param {string} type - Notification type
         * @returns {string} Font Awesome icon class
         */
        getIconForType(type) {
            switch (type) {
                case 'success': return 'fa-check-circle';
                case 'error': return 'fa-exclamation-circle';
                case 'warning': return 'fa-exclamation-triangle';
                case 'info': return 'fa-info-circle';
                default: return 'fa-bell';
            }
        }
    };

    /**
     * Theme Management System
     */
    const ThemeManager = {
        init() {
            // Set initial theme
            document.documentElement.setAttribute('data-theme', state.theme);
            
            // Create theme toggle if it doesn't exist
            const themeToggle = document.querySelector('.theme-toggle');
            
            if (!themeToggle) {
                const navbar = document.querySelector('.navbar');
                
                if (navbar) {
                    const toggle = document.createElement('div');
                    toggle.className = 'theme-toggle';
                    toggle.setAttribute('role', 'button');
                    toggle.setAttribute('aria-label', 'Toggle theme');
                    toggle.setAttribute('tabindex', '0');
        
                    
                    toggle.addEventListener('click', this.toggleTheme.bind(this));
                    toggle.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            this.toggleTheme();
                        }
                    });
                    
                    navbar.appendChild(toggle);
                }
            } else {
                themeToggle.addEventListener('click', this.toggleTheme.bind(this));
            }
        },
        
        /**
         * Toggle between light and dark themes
         */
        toggleTheme() {
            const currentTheme = document.documentElement.getAttribute('data-theme');
            const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
            
            // Apply transition class for smooth color changes
            document.documentElement.classList.add('theme-transition');
            
            // Update theme
            document.documentElement.setAttribute('data-theme', newTheme);
            state.theme = newTheme;
            localStorage.setItem('theme', newTheme);
            
            // Log theme change to analytics
            if (window.gtag) {
                window.gtag('event', 'theme_change', {
                    'theme': newTheme
                });
            }
            
            // Remove transition class after animation completes
            setTimeout(() => {
                document.documentElement.classList.remove('theme-transition');
            }, 500);
        }
    };

    /**
     * Navigation Management
     */
    const Navigation = {
        init() {
            // Mobile menu toggle
            const burger = document.querySelector('.burger');
            const navLinks = document.querySelector('.nav-links');
            
            if (burger && navLinks) {
                // Toggle menu when clicking burger icon
                burger.addEventListener('click', () => {
                    burger.classList.toggle('active');
                    navLinks.classList.toggle('active');
                    document.body.classList.toggle('menu-open');
                });
                
                // Close menu when clicking outside
                document.addEventListener('click', (e) => {
                    if (navLinks.classList.contains('active') && 
                        !navLinks.contains(e.target) && 
                        !burger.contains(e.target)) {
                        burger.classList.remove('active');
                        navLinks.classList.remove('active');
                        document.body.classList.remove('menu-open');
                    }
                });
                
                // Accessibility: ESC key to close menu
                document.addEventListener('keydown', (e) => {
                    if (e.key === 'Escape' && navLinks.classList.contains('active')) {
                        burger.classList.remove('active');
                        navLinks.classList.remove('active');
                        document.body.classList.remove('menu-open');
                    }
                });
            }
            
            // Staff dashboard tabs
            this.initStaffTabs();
        },
        
        /**
         * Initialize staff dashboard tabs
         */
        initStaffTabs() {
            // Make showSection global for use in HTML
            window.showSection = (sectionId, event) => {
                // Hide all sections
                document.querySelectorAll('.staff-section').forEach(section => {
                    section.classList.remove('active');
                });
                
                // Remove active class from all nav buttons
                document.querySelectorAll('.staff-nav-btn').forEach(btn => {
                    btn.classList.remove('active');
                });
                
                // Show the selected section
                const selectedSection = document.getElementById(`${sectionId}-section`);
                if (selectedSection) {
                    selectedSection.classList.add('active');
                }
                
                // Make clicked button active
                if (event && event.currentTarget) {
                    event.currentTarget.classList.add('active');
                }
                
                // Save current tab in sessionStorage
                sessionStorage.setItem('activeStaffTab', sectionId);
                
                // Log tab change to analytics
                if (window.gtag) {
                    window.gtag('event', 'tab_change', {
                        'tab': sectionId
                    });
                }
            };
            
            // Restore last active tab
            const lastTab = sessionStorage.getItem('activeStaffTab');
            if (lastTab) {
                const tabButton = document.querySelector(`.staff-nav-btn[onclick*="${lastTab}"]`);
                if (tabButton) {
                    tabButton.click();
                }
            }
        }
    };

    /**
     * Form Handlers
     */
    const FormHandlers = {
        init() {
            this.initProductForm();
            this.initGenerateForm();
            
            // Load Discord members for generator
            this.loadDiscordMembers();
        },
        
        /**
         * Initialize product management form
         */
        initProductForm() {
            const form = document.getElementById('productForm');
            
            if (form) {
                form.addEventListener('submit', async (e) => {
                    e.preventDefault();
                    
                    // Show loading state
                    const submitBtn = form.querySelector('button[type="submit"]');
                    const originalText = submitBtn.innerHTML;
                    submitBtn.disabled = true;
                    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Adding...';
                    
                    // Get form data
                    const productName = form.productName.value.trim();
                    
                    try {
                        const response = await fetch('/staff/products', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ productName })
                        });
                        
                        const data = await response.json();
                        
                        if (data.success) {
                            createNotification('Product added successfully', 'success');
                            
                            // Reset form
                            form.reset();
                            
                            // Reload page after delay
                            setTimeout(() => location.reload(), 1500);
                        } else {
                            throw new Error(data.message || 'Failed to add product');
                        }
                    } catch (error) {
                        console.error('Error adding product:', error);
                        createNotification(error.message || 'Failed to add product', 'error');
                        
                        // Reset button
                        submitBtn.disabled = false;
                        submitBtn.innerHTML = originalText;
                    }
                });
            }
        },
        
        /**
         * Initialize license generator form
         */
        initGenerateForm() {
            const form = document.getElementById('generateForm');
            
            if (form) {
                // Enhance product/new product fields
                const productSelect = form.querySelector('select[name="product"]');
                const newProductInput = form.querySelector('input[name="newProduct"]');
                
                if (productSelect && newProductInput) {
                    // When product is selected, clear new product input
                    productSelect.addEventListener('change', () => {
                        if (productSelect.value) {
                            newProductInput.value = '';
                        }
                    });
                    
                    // When new product is entered, clear product select
                    newProductInput.addEventListener('input', () => {
                        if (newProductInput.value) {
                            productSelect.value = '';
                        }
                    });
                }
                
                // Enhance user assignment fields
                const userSelect = form.querySelector('select[name="userId"]');
                const discordSelect = form.querySelector('select[name="discordId"]');
                
                if (userSelect && discordSelect) {
                    // When user is selected, clear discord select
                    userSelect.addEventListener('change', () => {
                        if (userSelect.value) {
                            discordSelect.value = '';
                        }
                    });
                    
                    // When discord is selected, clear user select
                    discordSelect.addEventListener('change', () => {
                        if (discordSelect.value) {
                            userSelect.value = '';
                        }
                    });
                }
                
                // Form submission handler
                form.addEventListener('submit', async (e) => {
                    e.preventDefault();
                    
                    // Show loading state
                    const submitBtn = form.querySelector('button[type="submit"]');
                    const originalText = submitBtn.innerHTML;
                    submitBtn.disabled = true;
                    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating...';
                    
                    // Get form data
                    const formData = {
                        duration: parseInt(form.duration.value),
                        quantity: parseInt(form.quantity.value),
                        product: form.product.value || form.newProduct.value,
                        userId: form.userId ? form.userId.value : null,
                        discordId: form.discordId ? form.discordId.value : null
                    };
                    
                    // Validate required fields
                    if (!formData.product) {
                        createNotification('Please select a product or enter a new product name', 'error');
                        submitBtn.disabled = false;
                        submitBtn.innerHTML = originalText;
                        return;
                    }
                    
                    try {
                        const response = await fetch('/staff/licenses/generate', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(formData)
                        });
                        
                        const data = await response.json();
                        
                        if (data.success) {
                            createNotification(`Successfully generated ${formData.quantity} license(s)`, 'success');
                            
                            // Reset form
                            form.reset();
                            
                            // Reload page after delay
                            setTimeout(() => location.reload(), 1500);
                        } else {
                            throw new Error(data.message || 'Failed to generate license');
                        }
                    } catch (error) {
                        console.error('Error generating license:', error);
                        createNotification(error.message || 'Failed to generate license', 'error');
                        
                        // Reset button
                        submitBtn.disabled = false;
                        submitBtn.innerHTML = originalText;
                    }
                });
            }
        },
        
        /**
         * Load Discord members for the dropdown
         */
        async loadDiscordMembers() {
            const discordSelect = document.querySelector('.discord-members-select');
            
            if (discordSelect) {
                try {
                    // Show loading state
                    const loadingOption = document.createElement('option');
                    loadingOption.textContent = 'Loading Discord members...';
                    discordSelect.appendChild(loadingOption);
                    
                    const response = await fetch('/auth/discord/members');
                    const data = await response.json();
                    
                    // Remove loading option
                    discordSelect.removeChild(loadingOption);
                    
                    if (data.members && Array.isArray(data.members)) {
                        // Sort members alphabetically
                        data.members.sort((a, b) => a.username.localeCompare(b.username));
                        
                        // Add members to dropdown
                        data.members.forEach(member => {
                            const option = document.createElement('option');
                            option.value = member.id;
                            option.textContent = `${member.username}${member.discriminator ? `#${member.discriminator}` : ''}`;
                            discordSelect.appendChild(option);
                        });
                        
                        // Add event listener for search filtering
                        discordSelect.addEventListener('click', () => {
                            const searchField = document.getElementById('discord-member-search');
                            
                            if (!searchField) {
                                // Create search field
                                const container = discordSelect.parentNode;
                                const search = document.createElement('input');
                                search.id = 'discord-member-search';
                                search.className = 'input-field';
                                search.placeholder = 'Search Discord members...';
                                search.style.marginBottom = '10px';
                                
                                // Insert before the select
                                container.insertBefore(search, discordSelect);
                                
                                // Add search functionality
                                search.addEventListener('input', () => {
                                    const query = search.value.toLowerCase();
                                    
                                    // Get all options except the first (placeholder)
                                    const options = Array.from(discordSelect.options).slice(1);
                                    
                                    options.forEach(option => {
                                        const visible = option.text.toLowerCase().includes(query);
                                        option.style.display = visible ? '' : 'none';
                                    });
                                });
                                
                                // Focus search field
                                search.focus();
                            }
                        });
                    } else {
                        const option = document.createElement('option');
                        option.value = '';
                        option.textContent = 'No Discord members found';
                        discordSelect.appendChild(option);
                    }
                } catch (error) {
                    console.error('Error fetching Discord members:', error);
                    
                    const option = document.createElement('option');
                    option.value = '';
                    option.textContent = 'Failed to load Discord members';
                    discordSelect.appendChild(option);
                }
            }
        }
    };

    /**
     * User Dashboard Functionality
     */
    const UserDashboard = {
        init() {
            this.initLicenseCards();
            this.initHwidReset();
        },
        
        /**
         * Initialize license card interactive effects
         */
        initLicenseCards() {
            const cards = document.querySelectorAll('.license-card');
            
            cards.forEach(card => {
                // Apply 3D hover effect
                card.addEventListener('mousemove', (e) => {
                    if (window.innerWidth >= 1024) {  // Only on desktop
                        const rect = card.getBoundingClientRect();
                        const x = ((e.clientX - rect.left) / rect.width) - 0.5;
                        const y = ((e.clientY - rect.top) / rect.height) - 0.5;
                        
                        card.style.transform = `perspective(1000px) rotateX(${y * -3}deg) rotateY(${x * 5}deg) translateZ(10px)`;
                    }
                });
                
                card.addEventListener('mouseleave', () => {
                    card.style.transform = 'perspective(1000px) rotateX(0) rotateY(0) translateZ(0)';
                });
            });
        },
        
        /**
         * Initialize HWID reset functionality
         */
        initHwidReset() {
            const resetButtons = document.querySelectorAll('.reset-hwid-btn');
            
            resetButtons.forEach(button => {
                // Check for cooldown data attribute
                const lastReset = button.dataset.lastReset;
                if (lastReset) {
                    updateHwidResetButton(button, lastReset);
                }
                
                button.addEventListener('click', async () => {
                    const licenseId = button.dataset.licenseId;
                    
                    if (!licenseId) {
                        console.error('No license ID found on reset button');
                        return;
                    }
                    
                    // Show loading state
                    const originalText = button.innerHTML;
                    button.disabled = true;
                    button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Resetting...';
                    
                    try {
                        const response = await fetch(`/api/licenses/${licenseId}/reset-hwid`, {
                            method: 'POST'
                        });
                        
                        if (response.ok) {
                            createNotification('HWID reset successfully', 'success');
                            
                            // Update button to show cooldown
                            const now = new Date().toISOString();
                            button.dataset.lastReset = now;
                            updateHwidResetButton(button, now);
                            
                            // Reload page after delay
                            setTimeout(() => location.reload(), 2000);
                        } else {
                            const data = await response.json();
                            throw new Error(data.message || 'Failed to reset HWID');
                        }
                    } catch (error) {
                        console.error('Error resetting HWID:', error);
                        createNotification(error.message || 'Failed to reset HWID', 'error');
                        
                        // Reset button
                        button.disabled = false;
                        button.innerHTML = originalText;
                    }
                });
            });
        }
    };

    /**
     * Staff Dashboard Functionality
     */
    const StaffDashboard = {
        init() {
            // Make functions available globally for the template
            window.toggleBan = this.toggleBan;
            window.toggleStaff = this.toggleStaff;
            window.toggleLicense = this.toggleLicense;
            window.deleteLicense = this.deleteLicense;
            window.resetHWID = this.resetHWID;
            window.deleteProduct = this.deleteProduct;
        },
        
        /**
         * Toggle user ban status
         * @param {string} userId - User ID to toggle ban
         * @param {HTMLElement} button - Button element that was clicked
         */
        async toggleBan(userId, button) {
            if (!userId || !button) return;
            
            // Show loading state
            const originalText = button.innerHTML;
            button.disabled = true;
            button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
            
            try {
                const response = await fetch(`/staff/users/${userId}/toggle-ban`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                });
                
                const data = await response.json();
                
                if (data.success) {
                    // Get current status
                    const isBanned = button.classList.contains('danger');
                    
                    // Toggle button appearance
                    button.classList.toggle('danger');
                    button.classList.toggle('success');
                    
                    // Update icon and text
                    const newText = isBanned ? 
                        '<i class="fas fa-ban"></i> Ban User' : 
                        '<i class="fas fa-unlock"></i> Unban User';
                    
                    button.innerHTML = newText;
                    button.disabled = false;
                    
                    // Success notification
                    createNotification(`User ${isBanned ? 'unbanned' : 'banned'} successfully`, 'success');
                    
                    // Update the parent card
                    const card = button.closest('.user-card');
                    const statusBadge = card.querySelector('.status-badge');
                    
                    if (statusBadge) {
                        statusBadge.className = `status-badge ${isBanned ? 'active' : 'inactive'}`;
                        statusBadge.textContent = isBanned ? 'Active' : 'Banned';
                    }
                } else {
                    throw new Error(data.message || 'Failed to update ban status');
                }
            } catch (error) {
                console.error('Error toggling ban:', error);
                createNotification(error.message || 'Error updating ban status', 'error');
                
                // Reset button
                button.disabled = false;
                button.innerHTML = originalText;
            }
        },
        
        /**
         * Toggle user staff status
         * @param {string} userId - User ID to toggle staff status
         * @param {HTMLElement} button - Button element that was clicked
         */
        async toggleStaff(userId, button) {
            if (!userId || !button) return;
            
            // Show loading state
            const originalText = button.innerHTML;
            button.disabled = true;
            button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
            
            try {
                const response = await fetch(`/staff/users/${userId}/toggle-staff`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                });
                
                const data = await response.json();
                
                if (data.success) {
                    // Get current status
                    const isStaff = button.classList.contains('staff-active');
                    
                    // Toggle button classes
                    button.classList.toggle('staff-active');
                    button.classList.toggle('staff-inactive');
                    
                    // Update the button icon and text
                    const newText = isStaff ?
                        '<i class="fas fa-user-plus"></i> Make Staff' :
                        '<i class="fas fa-user-minus"></i> Remove Staff';
                    
                    button.innerHTML = newText;
                    button.disabled = false;
                    
                    // Success notification
                    createNotification(`Staff status updated successfully`, 'success');
                    
                    // Update the parent card
                    const card = button.closest('.user-card');
                    const staffBadge = card.querySelector('.user-status');
                    
                    if (staffBadge) {
                        staffBadge.className = `user-status ${isStaff ? '' : 'staff'}`;
                        staffBadge.textContent = isStaff ? 'User' : 'Staff';
                    }
                } else {
                    throw new Error(data.message || 'Failed to update staff status');
                }
            } catch (error) {
                console.error('Error toggling staff status:', error);
                createNotification(error.message || 'Error updating staff status', 'error');
                
                // Reset button
                button.disabled = false;
                button.innerHTML = originalText;
            }
        },
        
        /**
         * Toggle license active status
         * @param {string} licenseId - License ID to toggle
         * @param {HTMLElement} button - Button element that was clicked
         */
        async toggleLicense(licenseId, button) {
            if (!licenseId || !button) return;
            
            // Show loading state
            const originalText = button.innerHTML;
            button.disabled = true;
            button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
            
            try {
                const response = await fetch(`/staff/licenses/${licenseId}/toggle`, {
                    method: 'POST'
                });
                
                if (response.ok) {
                    // Get current status
                    const isActive = button.classList.contains('active');
                    
                    // Toggle button classes
                    button.classList.toggle('active');
                    button.classList.toggle('inactive');
                    
                    // Update the button text
                    const newText = isActive ?
                        '<i class="fas fa-power-off"></i> Activate Key' :
                        '<i class="fas fa-power-off"></i> Deactivate Key';
                    
                    button.innerHTML = newText;
                    button.disabled = false;
                    
                    // Update card and badge
                    const card = button.closest('.license-card');
                    const badge = card.querySelector('.status-badge');
                    
                    if (card) {
                        card.classList.toggle('active');
                        card.classList.toggle('inactive');
                    }
                    
                    if (badge) {
                        badge.classList.toggle('active');
                        badge.classList.toggle('inactive');
                        badge.textContent = isActive ? 'Inactive' : 'Active';
                    }
                    
                    // Success notification
                    createNotification(`License ${isActive ? 'deactivated' : 'activated'} successfully`, 'success');
                } else {
                    const data = await response.json();
                    throw new Error(data.message || 'Failed to update license');
                }
            } catch (error) {
                console.error('Error toggling license:', error);
                createNotification(error.message || 'Failed to update license', 'error');
                
                // Reset button
                button.disabled = false;
                button.innerHTML = originalText;
            }
        },
        
        /**
         * Delete a license
         * @param {string} licenseId - License ID to delete
         */
        async deleteLicense(licenseId) {
            if (!licenseId) return;
            
            try {
                const response = await fetch(`/staff/licenses/${licenseId}`, {
                    method: 'DELETE'
                });
                
                if (response.ok) {
                    createNotification('License deleted successfully', 'success');
                    
                    // Find and remove license card with animation
                    // Find and remove license card with animation
                    const licenseCard = document.querySelector(`.license-card[data-license-id="${licenseId}"]`);
                    if (licenseCard) {
                        licenseCard.classList.add('card-removing');
                        setTimeout(() => {
                            licenseCard.remove();
                        }, 300);
                    } else {
                        // Fallback to page reload
                        setTimeout(() => location.reload(), 1000);
                    }
                } else {
                    const data = await response.json();
                    throw new Error(data.message || 'Failed to delete license');
                }
            } catch (error) {
                console.error('Error deleting license:', error);
                createNotification(error.message || 'Failed to delete license', 'error');
            }
        },
        
        /**
         * Reset a license's HWID
         * @param {string} licenseId - License ID to reset HWID
         */
        async resetHWID(licenseId) {
            if (!licenseId) return;
            
            try {
                const response = await fetch(`/staff/licenses/${licenseId}/reset-hwid`, {
                    method: 'POST'
                });
                
                if (response.ok) {
                    createNotification('HWID reset successfully', 'success');
                    setTimeout(() => location.reload(), 1000);
                } else {
                    const data = await response.json();
                    throw new Error(data.message || 'Failed to reset HWID');
                }
            } catch (error) {
                console.error('Error resetting HWID:', error);
                createNotification(error.message || 'Failed to reset HWID', 'error');
            }
        },
        
        /**
         * Delete a product
         * @param {string} productId - Product ID to delete
         */
        async deleteProduct(productId) {
            if (!productId) return;
            
            try {
                const response = await fetch(`/staff/products/${productId}`, {
                    method: 'DELETE'
                });
                
                if (response.ok) {
                    createNotification('Product deleted successfully', 'success');
                    
                    // Find and remove product item with animation
                    const productItem = document.querySelector(`.product-item[data-product-id="${productId}"]`);
                    if (productItem) {
                        productItem.classList.add('item-removing');
                        setTimeout(() => {
                            productItem.remove();
                        }, 300);
                    } else {
                        // Fallback to page reload
                        setTimeout(() => location.reload(), 1000);
                    }
                } else {
                    const data = await response.json();
                    throw new Error(data.message || 'Failed to delete product');
                }
            } catch (error) {
                console.error('Error deleting product:', error);
                createNotification(error.message || 'Failed to delete product', 'error');
            }
        }
    };

    /**
     * Initialize copy buttons throughout the interface
     */
    function initCopyButtons() {
        const copyButtons = document.querySelectorAll('.copy-btn');
        
        copyButtons.forEach(button => {
            button.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                let textToCopy = '';
                
                // Get the text to copy
                if (button.dataset.copy) {
                    // Copy from data attribute
                    textToCopy = button.dataset.copy;
                } else if (button.getAttribute('onclick')) {
                    // Extract from onclick attribute (for backward compatibility)
                    const onclickAttr = button.getAttribute('onclick');
                    const match = onclickAttr.match(/copyKey\(['"](.+)['"]\)/);
                    if (match && match[1]) {
                        textToCopy = match[1];
                    }
                } else {
                    // Get from previous sibling
                    const prevSibling = button.previousElementSibling;
                    if (prevSibling && prevSibling.tagName === 'CODE') {
                        textToCopy = prevSibling.textContent;
                    }
                }
                
                if (!textToCopy) {
                    createNotification('No text to copy', 'error');
                    return;
                }
                
                try {
                    await navigator.clipboard.writeText(textToCopy);
                    
                    // Visual feedback
                    const originalText = button.innerHTML;
                    button.innerHTML = '<i class="fas fa-check"></i> Copied!';
                    
                    
                    // Reset button after 2 seconds
                    setTimeout(() => {
                        button.innerHTML = originalText;
                    }, 2000);
                } catch (err) {
                    console.error('Copy failed:', err);
                }
            });
        });
        // Add this to dash.js
document.addEventListener('DOMContentLoaded', function() {
    // Add event listener for all reset HWID buttons
    document.addEventListener('click', function(event) {
        if (event.target.classList.contains('reset-hwid-btn')) {
            const licenseId = event.target.dataset.licenseId;
            if (licenseId) {
                resetHWID(licenseId);
            } else {
                console.error('No license ID found on reset button');
            }
        }
    });
});

        async function resetHWID(licenseId) {
            try {
                const response = await fetch(`/api/licenses/${licenseId}/reset-hwid`, {
                    method: 'POST'
                });
        
                if (response.ok) {
                    createNotification('HWID reset successfully', 'success');
                    setTimeout(() => {
                        window.location.reload();
                    }, 2000);
                }
            } catch (error) {
                createNotification('Failed to reset HWID', 'error');
            }
        }
        
        // Make copyKey function globally available for backward compatibility
        window.copyKey = (text) => {
            navigator.clipboard.writeText(text)
                .then(() => {
                    createNotification('Copied to clipboard!', 'success');
                })
                .catch(err => {
                    console.error('Copy failed:', err);
                    createNotification('Failed to copy to clipboard', 'error');
                });
        };
    }

    /**
     * Initialize interactive elements with hover effects
     */
    function initInteractiveElements() {
        // Add hover effects to cards
        const interactiveCards = document.querySelectorAll('.interactive-card');
        
        interactiveCards.forEach(card => {
            // Add subtle movement on hover for desktop
            if (window.innerWidth >= 1024) {
                card.addEventListener('mousemove', (e) => {
                    const rect = card.getBoundingClientRect();
                    const x = ((e.clientX - rect.left) / rect.width) - 0.5;
                    const y = ((e.clientY - rect.top) / rect.height) - 0.5;
                    
                    card.style.transform = `perspective(1000px) rotateX(${y * -2}deg) rotateY(${x * 2}deg) translateZ(5px)`;
                });
                
                card.addEventListener('mouseleave', () => {
                    card.style.transform = 'perspective(1000px) rotateX(0) rotateY(0) translateZ(0)';
                });
            }
        });
        
        // Add hover effect to buttons
        const hoverGlowElements = document.querySelectorAll('.hover-glow');
        
        hoverGlowElements.forEach(el => {
            el.addEventListener('mouseenter', () => {
                el.classList.add('glowing');
            });
            
            el.addEventListener('mouseleave', () => {
                el.classList.remove('glowing');
            });
        });
    }

    /**
     * Update HWID reset button based on cooldown
     * @param {HTMLElement} button - The reset button element
     * @param {string} lastResetTime - ISO timestamp of last reset
     */
    function updateHwidResetButton(button, lastResetTime) {
        if (!button || !lastResetTime) return;
        
        const cooldownPeriod = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
        const now = new Date();
        const resetTime = new Date(lastResetTime);
        const timeLeft = cooldownPeriod - (now - resetTime);
        
        if (timeLeft > 0) {
            // Hide button, show countdown
            button.style.display = 'none';
            
            // Format time left
            const hours = Math.floor(timeLeft / (60 * 60 * 1000));
            const minutes = Math.floor((timeLeft % (60 * 60 * 1000)) / (60 * 1000));
            
            const countdownText = `Available in ${hours}h ${minutes}m`;
            
            // Create countdown element if it doesn't exist
            let countdownElement = button.parentNode.querySelector('.reset-countdown');
            
            if (!countdownElement) {
                countdownElement = document.createElement('div');
                countdownElement.className = 'reset-countdown';
                button.parentNode.insertBefore(countdownElement, button);
            }
            
            countdownElement.textContent = countdownText;
            
            // Update countdown every minute
            const updateInterval = setInterval(() => {
                const newNow = new Date();
                const newTimeLeft = cooldownPeriod - (newNow - resetTime);
                
                if (newTimeLeft <= 0) {
                    // Cooldown expired, show button
                    clearInterval(updateInterval);
                    countdownElement.remove();
                    button.style.display = 'flex';
                } else {
                    // Update countdown
                    const newHours = Math.floor(newTimeLeft / (60 * 60 * 1000));
                    const newMinutes = Math.floor((newTimeLeft % (60 * 60 * 1000)) / (60 * 1000));
                    countdownElement.textContent = `Available in ${newHours}h ${newMinutes}m`;
                }
            }, 60000); // Update every minute
        } else {
            // Cooldown expired, show button
            button.style.display = 'flex';
            
            // Remove countdown if it exists
            const existingCountdown = button.parentNode.querySelector('.reset-countdown');
            if (existingCountdown) {
                existingCountdown.remove();
            }
        }
    }

    /**
     * Check if current page is the staff dashboard
     * @returns {boolean} True if on staff page
     */
    function isStaffPage() {
        return document.querySelector('.staff-nav') !== null;
    }

    /**
     * Check if current page is the user dashboard
     * @returns {boolean} True if on user dashboard
     */
    function isUserDashboard() {
        return document.querySelector('.dashboard-header') !== null && !isStaffPage();
    }

    /**
     * Log page view to analytics
     */
    function logPageView() {
        if (window.gtag) {
            window.gtag('event', 'page_view', {
                page_title: document.title,
                page_location: window.location.href,
                page_path: window.location.pathname
            });
        }
    }

    // Backward compatibility for existing code
    window.toggleMenu = function() {
        const burger = document.querySelector('.burger');
        const navLinks = document.querySelector('.nav-links');
        
        if (burger && navLinks) {
            burger.classList.toggle('active');
            navLinks.classList.toggle('active');
            document.body.classList.toggle('menu-open');
        }
    };
})();


