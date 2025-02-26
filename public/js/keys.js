// Product management
document.getElementById('productForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    
    try {
        const response = await fetch('/api/products', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ name: formData.get('productName') })
        });
        
        if (response.ok) {
            window.location.reload();
        }
    } catch (error) {
        console.error('Error adding product:', error);
    }
});

async function deleteProduct(id) {
    if (!confirm('Are you sure you want to delete this product?')) return;
    
    try {
        const response = await fetch(`/api/products/${id}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            window.location.reload();
        }
    } catch (error) {
        console.error('Error deleting product:', error);
    }
}

// Update license generation to handle new products
document.getElementById('generateForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const productName = formData.get('product') || formData.get('newProduct');
    
    const data = {
        duration: formData.get('duration'),
        quantity: formData.get('quantity'),
        userId: formData.get('userId'),
        discordId: formData.get('discordId'),
        product: productName
    };

    if (!data.product) {
        alert('Please select or enter a product name');
        return;
    }

    try {
        // If it's a new product, save it first
        if (formData.get('newProduct')) {
            await fetch('/api/products', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ name: data.product })
            });
        }

        const response = await fetch('/api/licenses/generate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data)
        });
        
        if (response.ok) {
            window.location.reload();
        }
    } catch (error) {
        console.error('Error generating licenses:', error);
    }
});