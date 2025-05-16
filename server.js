// Load environment variables from .env file if it exists (for local development)
require('dotenv').config();

const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const cors = require('cors');
const app = express();

const port = process.env.PORT || 3001;
const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

// --- Middleware ---

// 1. CORS Configuration
const corsOptions = {
  origin: frontendUrl, // Allow requests only from your frontend URL
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

// 2. Body Parsers
// Stripe webhook requests need the raw body, so we apply express.json() and express.urlencoded()
// only to routes that are not the webhook handler.
<script async
  src="https://js.stripe.com/v3/buy-button.js">
</script>

<stripe-buy-button
  buy-button-id="buy_btn_1RPUYRJpzklZhfKTKobdT8ut"
  publishable-key="pk_live_51RCPeyJpzklZhfKTC3TI7nJKyd04cFMnpw46XjfPhSbc90bbzKFaZuHBVdBESAAgl6vqZfK1BQYgeeklir8gd4HD00qwppQXdL"
>
</stripe-buy-button>


// --- API Routes ---

// Root route for basic health check
app.get('/', (req, res) => {
  res.send('AI Talks Back Backend is running!');
});

// POST /create-checkout-session
// Creates a Stripe Checkout Session for starting a new subscription.
app.post('/create-checkout-session', async (req, res) => {
  const { email } = req.body;
  const priceId = process.env.STRIPE_PRICE_ID;

  if (!priceId) {
    console.error('STRIPE_PRICE_ID is not set in environment variables.');
    return res.status(500).json({ error: { message: 'Server configuration error: Missing Price ID.' } });
  }

  try {
    const sessionParams = {
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${frontendUrl}/ai-talks-back/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${frontendUrl}/ai-talks-back/cancel`,
    };

    if (email) {
      sessionParams.customer_email = email;
    }
    // If you had a way to get a client_reference_id without a database (e.g., a temporary session ID from frontend)
    // you could set it here: sessionParams.client_reference_id = someFrontendGeneratedId;

    const session = await stripe.checkout.sessions.create(sessionParams);

    console.log(`Stripe Checkout Session created: ${session.id}`);
    res.json({ sessionId: session.id });

  } catch (e) {
    console.error('Error creating Stripe checkout session:', e);
    res.status(500).json({ error: { message: e.message || 'Failed to create checkout session.' } });
  }
});

// GET /verify-subscription
// Verifies a subscription status using a Stripe Checkout Session ID.
app.get('/verify-subscription', async (req, res) => {
  const sessionId = req.query.session_id;

  if (!sessionId) {
    console.warn('Verification attempt with no session_id query parameter.');
    return res.status(400).json({ success: false, error: 'Session ID is required for verification.' });
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status === 'paid') {
      console.log(`Subscription payment successful for session_id: ${sessionId}. Customer: ${session.customer}, Subscription: ${session.subscription}`);

      // Since there's no database, we can't store this information server-side persistently.
      // We return the relevant IDs to the frontend. The frontend might store these
      // in localStorage to "remember" the subscription for the current browser session.
      const customerId = session.customer;
      const subscriptionId = session.subscription;

      res.json({
        success: true,
        message: 'Subscription successfully verified!',
        data: {
          customerId: customerId,
          subscriptionId: subscriptionId,
          // The frontend can use these IDs, e.g., to redirect to Stripe's customer portal
          // or to conditionally show/hide features.
        }
      });
    } else {
      console.warn(`Subscription payment not successful for session_id: ${sessionId}. Payment Status: ${session.payment_status}, Session Status: ${session.status}`);
      res.status(400).json({ success: false, error: 'Subscription payment not successful or session incomplete.' });
    }
  } catch (error) {
    console.error('Error verifying Stripe session:', error);
    res.status(500).json({ success: false, error: 'Internal server error during subscription verification.' });
  }
});


// --- Webhook Handler ---
// Stripe sends events here. Even without a database, logging these events is useful.
// The `express.raw({type: 'application/json'})` middleware is crucial for webhook signature verification.
// It needs to be applied specifically to this route *before* express.json() might parse it.
app.post('/stripe-webhooks', express.raw({type: 'application/json'}), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  if (!webhookSecret) {
    console.error('STRIPE_WEBHOOK_SECRET is not set. Webhook processing aborted.');
    return res.status(400).send('Webhook Error: Missing webhook secret configuration on server.');
  }
  if (!sig) {
    console.error('No stripe-signature header found. Webhook processing aborted.');
    return res.status(400).send('Webhook Error: Missing signature.');
  }

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error(`Webhook signature verification failed: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  console.log(`Webhook received: Event type: ${event.type}, Event ID: ${event.id}`);
  switch (event.type) {
    case 'checkout.session.completed':
      const session = event.data.object;
      // A Checkout Session has been successfully completed.
      // The payment was successful.
      console.log(`Webhook: Checkout session completed for ${session.id}. Customer: ${session.customer}, Subscription: ${session.subscription}`);
      // TODO (No Database):
      // - Log this event. (Done by the console.log above)
      // - If you had an email service, you could send a confirmation email to session.customer_details.email.
      // - Since there's no database, there's no internal user record to update here.
      // - The frontend would have already been redirected via success_url and handled by /verify-subscription.
      break;
    case 'invoice.payment_succeeded':
      const invoice = event.data.object;
      // An invoice (often for a recurring subscription payment) was successfully paid.
      console.log(`Webhook: Invoice payment succeeded for ${invoice.id}, Subscription: ${invoice.subscription}, Customer: ${invoice.customer}`);
      // TODO (No Database):
      // - Log this event. (Done)
      // - This confirms continued subscription. Without a database, there's no internal status to update.
      // - If the frontend manages access based on a stored subscription ID, this event reconfirms its validity.
      break;
    case 'invoice.payment_failed':
      const failedInvoice = event.data.object;
      // An invoice payment failed (e.g., card expired).
      console.log(`Webhook: Invoice payment failed for ${failedInvoice.id}, Subscription: ${failedInvoice.subscription}, Customer: ${failedInvoice.customer}`);
      // TODO (No Database):
      // - Log this critical event. (Done)
      // - Stripe will typically retry failed payments.
      // - If you had an email service, you might notify the customer (though Stripe often does this).
      // - Without a database, you can't mark a user's access as "past_due" in your system.
      //   The user might lose access if your frontend strictly checks subscription status via Stripe APIs
      //   (e.g., by redirecting to customer portal where they can update payment).
      break;
    case 'customer.subscription.deleted':
      const deletedSubscription = event.data.object;
      // A subscription was canceled (either by the customer or admin in Stripe).
      console.log(`Webhook: Subscription ${deletedSubscription.id} (Customer: ${deletedSubscription.customer}) was canceled/deleted. Status: ${deletedSubscription.status}`);
      // TODO (No Database):
      // - Log this event. (Done)
      // - This is a key event. If the frontend was storing the subscription ID to grant access,
      //   it would ideally need to know this subscription is no longer valid. This is hard to achieve
      //   without a backend state or having the frontend regularly re-verify the subscription status
      //   with Stripe (which is less efficient).
      break;
    case 'customer.subscription.updated':
      const updatedSubscription = event.data.object;
      console.log(`Webhook: Subscription ${updatedSubscription.id} (Customer: ${updatedSubscription.customer}) was updated. Status: ${updatedSubscription.status}`);
      // TODO (No Database):
      // - Log this event. (Done)
      // - This could be due to plan changes, trial ending, or status changes like 'past_due'.
      // - If status is 'past_due' or 'unpaid', it's similar to invoice.payment_failed.
      break;
    default:
      console.log(`Webhook: Unhandled event type ${event.type}`);
  }

  res.json({received: true});
});


// --- Start Server ---
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
  console.log(`Allowed frontend origin for CORS: ${frontendUrl}`);
  if (!process.env.STRIPE_SECRET_KEY) {
    console.warn('WARNING: STRIPE_SECRET_KEY environment variable is not set!');
  }
  if (!process.env.STRIPE_PRICE_ID) {
    console.warn('WARNING: STRIPE_PRICE_ID environment variable is not set!');
  }
  if (!webhookSecret && app._router.stack.some(layer => layer.route && layer.route.path === '/stripe-webhooks')) {
     console.warn('WARNING: STRIPE_WEBHOOK_SECRET environment variable is not set, but webhook endpoint is present. Webhooks will fail signature verification.');
  }
});