exports.handler = async (event, context) => {
    return {
        statusCode: 200,
        headers: {
            'Access-Control-Allow-Origin': '*', // Allow requests from any domain
            'Access-Control-Allow-Headers': 'Content-Type',
        },
        body: JSON.stringify({
            message: 'Hello from Netlify!',
            timestamp: new Date().toISOString()
        })
    }
}