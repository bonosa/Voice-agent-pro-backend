const express = require('express');
const Stripe = require('stripe');
const cors = require('cors');
const app = express();
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

app.use(cors({ origin: 'https://bonosa.github.io' }));
app.use(express.json()); // Ensure JSON body parsing

app.get('/', (req, res) => {
    res.send('Backend is running! Use POST /create-checkout-session to create a Stripe session.');
});

app.post('/create-checkout-session', async (req, res) => {
    try {
        // Debug: Log the received priceId
        console.log('Received priceId:', req.body.priceId);
        if (!req.body.priceId) {
            return res.status(400).json({ error: 'priceId is required' });
        }

        const session = await stripe.checkout.sessions.create({
            mode: 'subscription',
            payment_method_types: ['card'],
            line_items: [{
                price: req.body.priceId, // Ensure this is a valid Price ID
                quantity: 1
            }],
            success_url: 'https://bonosa.github.io/ai-talks-back/success/',
            cancel_url: 'https://bonosa.github.io/ai-talks-back/cancel/',
        });
        res.json({ sessionId: session.id });
    } catch (error) {
        console.error('Stripe error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

app.listen(3000, () => console.log('Server running on port 3000'));