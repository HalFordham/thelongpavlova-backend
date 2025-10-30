const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)
const fetch = require('node-fetch')

// This is your Stripe webhook signing secret (we'll add this later)
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET

exports.handler = async (event) => {
    // Handle CORS
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type, stripe-signature',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
            },
            body: '',
        }
    }

    const sig = event.headers['stripe-signature']
    let stripeEvent

    try {
        // Verify the webhook signature
        stripeEvent = stripe.webhooks.constructEvent(
            event.body,
            sig,
            endpointSecret
        )
    } catch (err) {
        console.error('Webhook signature verification failed:', err.message)
        return {
            statusCode: 400,
            body: JSON.stringify({ error: `Webhook Error: ${err.message}` }),
        }
    }

    // Handle the checkout.session.completed event
    if (stripeEvent.type === 'checkout.session.completed') {
        const session = stripeEvent.data.object

        console.log('Payment successful for session:', session.id)

        try {
            // Get full session details including line items
            const fullSession = await stripe.checkout.sessions.retrieve(
                session.id,
                {
                    expand: ['line_items'],
                }
            )

            // Get customer details
            const customerEmail = fullSession.customer_details.email
            const customerName = fullSession.customer_details.name
            const shippingAddress = fullSession.shipping_details?.address || fullSession.customer_details?.address

            // Prepare line items for Printify
            const printifyLineItems = fullSession.line_items.data.map(item => ({
                product_id: item.price.product, // You'll need to map this to Printify product IDs
                variant_id: 1, // You'll need to map variants
                quantity: item.quantity,
            }))

            // Create Printify order
            const printifyOrder = await fetch(
                `https://api.printify.com/v1/shops/${process.env.PRINTIFY_SHOP_ID}/orders.json`,
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${process.env.PRINTIFY_API_TOKEN}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        external_id: session.id,
                        label: `Order from ${customerName}`,
                        line_items: printifyLineItems,
                        shipping_method: 1, // Standard shipping
                        send_shipping_notification: true,
                        address_to: {
                            first_name: customerName?.split(' ')[0] || 'Customer',
                            last_name: customerName?.split(' ').slice(1).join(' ') || '',
                            email: customerEmail,
                            address1: shippingAddress?.line1 || '',
                            address2: shippingAddress?.line2 || '',
                            city: shippingAddress?.city || '',
                            region: shippingAddress?.state || '',
                            zip: shippingAddress?.postal_code || '',
                            country: shippingAddress?.country || 'US',
                        },
                    }),
                }
            )

            const printifyResult = await printifyOrder.json()

            if (printifyOrder.ok) {
                console.log('Printify order created:', printifyResult.id)
            } else {
                console.error('Printify order creation failed:', printifyResult)
            }

        } catch (error) {
            console.error('Error creating Printify order:', error)
        }
    }

    return {
        statusCode: 200,
        body: JSON.stringify({ received: true }),
    }
}