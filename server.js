const express = require('express');
const Stripe = require('stripe');
const cors = require('cors');
require('dotenv').config(); // To load environment variables from a .env file

const app = express();

// Ensure STRIPE_SECRET_KEY is loaded
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
if (!stripeSecretKey) {
    console.error("FATAL ERROR: STRIPE_SECRET_KEY is not set in environment variables.");
    process.exit(1); // Exit if key is not found
}
const stripe = Stripe(stripeSecretKey);

// Configure CORS - be specific in production
app.use(cors({ origin: 'https://bonosa.github.io' })); // Replace with your frontend URL if different
app.use(express.json()); // Middleware to parse JSON bodies

app.get('/', (req, res) => {
    res.send('Backend is running! Use POST /create-checkout-session to create a Stripe session.');
});

app.post('/create-checkout-session', async (req, res) => {
    try {
        const { priceId, email: customerEmail } = req.body; // Destructure priceId and email

        if (!priceId || !customerEmail) {
            return res.status(400).json({ error: 'priceId and email are required.' });
        }

        // Validate email format (basic)
        if (!/^\S+@\S+\.\S+$/.test(customerEmail)) {
            return res.status(400).json({ error: 'Invalid email format provided.' });
        }

        // Step 1: Find or create the customer by email
        let customer;
        const existingCustomers = await stripe.customers.list({ email: customerEmail, limit: 1 });

        if (existingCustomers.data.length > 0) {
            customer = existingCustomers.data[0];
            // Optional: Update customer details if needed
            // customer = await stripe.customers.update(customer.id, { metadata: { ... } });
        } else {
            customer = await stripe.customers.create({ email: customerEmail });
        }

        // Step 2: Check if the customer already has an active subscription for this specific price
        const existingSubscriptions = await stripe.subscriptions.list({
            customer: customer.id,
            price: priceId,
            status: 'active', // Only consider 'active' or 'trialing' subscriptions
            limit: 1
        });

        if (existingSubscriptions.data.length > 0) {
            return res.status(400).json({ error: 'You already have an active subscription for this plan with this email address.' });
        }

        // Step 3: Create a checkout session
        const session = await stripe.checkout.sessions.create({
            mode: 'subscription',
            payment_method_types: ['card'],
            customer: customer.id, // Attach customer to session
            line_items: [{
                price: priceId,
                quantity: 1
            }],
            // Make sure these URLs are correct and live
            success_url: 'https://bonosa.github.io/ai-talks-back/success/?session_id={CHECKOUT_SESSION_ID}', // Stripe appends session_id
            cancel_url: 'https://bonosa.github.io/ai-talks-back/cancel/',
            // You can also enable promotions or trial periods here if needed
            // allow_promotion_codes: true,
            // subscription_data: {
            // trial_period_days: 7,
            // },
        });

        res.json({ sessionId: session.id });

    } catch (error) {
        console.error('Stripe error:', error); // Log the full error for debugging
        // Send a more generic error message to the client for security
        let userMessage = 'An error occurred while processing your subscription.';
        if (error.type === 'StripeCardError') {
            userMessage = error.message; // StripeCardError messages are usually safe to show
        } else if (error.code === 'resource_missing' && error.param === 'price') {
             userMessage = 'The selected subscription plan (priceId) is invalid. Please contact support.';
        }
        // Add more specific Stripe error handling if needed

        res.status(500).json({ error: userMessage });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));