const { Configuration, OpenAIApi } = require("openai");

const chat = async (prompt, text) => {
     try {
        const configuration = new Configuration({
            //apiKey: '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',
          //  apiKey: process.env.OPENAI_API_KEY,

        });
        const openai = new OpenAIApi(configuration);
        const completion = await openai.createChatCompletion({
            model: "gpt-3.5-turbo",
            messages: [
                { role: "system", content: prompt },
                { role: "user", content: text },
            ],
        });
        return completion.data.choices[0].message;
    } catch (err) {
        console.error("Error al conectar con OpenAI:", err);
        return "ERROR";
    }
};

module.exports = chat;
