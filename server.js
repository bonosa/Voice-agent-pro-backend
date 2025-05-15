const express = require('express');
const Stripe = require('stripe');
const cors = require('cors');
const app = express();
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

app.use(cors());
app.use(express.json());

// Add root route for debugging
app.get('/', (req, res) => {
    res.send('Backend is running! Use POST /create-checkout-session to create a Stripe session.');
});

app.post('/create-checkout-session', async (req, res) => {
    try {
        const session = await stripe.checkout.sessions.create({
            mode: 'subscription',
            payment_method_types: ['card'],
            line_items: [{ price: process.env.PRICE_ID, quantity: 1 }],
            success_url: 'https://your-username.github.io/ai-talks-back/success/',
            cancel_url: 'https://your-username.github.io/ai-talks-back/cancel/',
        });
        res.json({ sessionId: session.id });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(3000, () => console.log('Server running on port 3000'));