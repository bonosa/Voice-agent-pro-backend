const express = require('express');
const Stripe = require('stripe');
const cors = require('cors');
const app = express();
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

app.use(cors({ origin: 'https://bonosa.github.io' }));
app.use(express.json());

app.get('/', (req, res) => {
    res.send('Backend is running! Use POST /create-checkout-session to create a Stripe session.');
});

app.post('/create-checkout-session', async (req, res) => {
    try {
        const priceId = req.body.priceId;
        const customerEmail = req.body.email; // Collect email from frontend

        if (!priceId || !customerEmail) {
            return res.status(400).json({ error: 'priceId and email are required' });
        }

        // Step 1: Check if customer exists by email
        let customer;
        const customers = await stripe.customers.list({ email: customerEmail, limit: 1 });
        if (customers.data.length > 0) {
            customer = customers.data[0];
        } else {
            // Create a new customer if not found
            customer = await stripe.customers.create({ email: customerEmail });
        }

        // Step 2: Create a checkout session with customer ID
        const session = await stripe.checkout.sessions.create({
            mode: 'subscription',
            payment_method_types: ['card'],
            customer: customer.id, // Attach customer to session
            line_items: [{
                price: priceId,
                quantity: 1
            }],
            success_url: 'https://bonosa.github.io/ai-talks-back/success/',
            cancel_url: 'https://bonosa.github.io/ai-talks-back/cancel/',
        });

        // Step 3: After session creation, check for existing subscriptions with the same card
        const paymentIntent = await stripe.checkout.sessions.retrieve(session.id, {
            expand: ['payment_intent']
        });

        if (paymentIntent.payment_intent) {
            const paymentMethodId = paymentIntent.payment_intent.payment_method;
            const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
            const cardFingerprint = paymentMethod.card.fingerprint;

            // Check customer's subscriptions
            const subscriptions = await stripe.subscriptions.list({
                customer: customer.id,
                status: 'active',
                expand: ['data.default_payment_method']
            });

            for (const subscription of subscriptions.data) {
                if (subscription.default_payment_method &&
                    subscription.default_payment_method.card.fingerprint === cardFingerprint) {
                    // Card already used for an active subscription
                    return res.status(400).json({ error: 'This card is already used for an active subscription.' });
                }
            }
        }

        res.json({ sessionId: session.id });
    } catch (error) {
        console.error('Stripe error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

app.listen(3000, () => console.log('Server running on port 3000'));