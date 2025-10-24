const textInput = document.getElementById('text-input');
        const resultsContainer = document.getElementById('results-container');
        const analyzeBtn = document.getElementById('analyze-btn');
        const taskSelect = document.getElementById('task-select');

        const wordInputContainer = document.getElementById('word-input-container');
        const wordInput = document.getElementById('word-input');
        const sentenceInputContainer = document.getElementById('sentence-input-container');
        const sentenceInput = document.getElementById('sentence-input');
        const statementInputContainer = document.getElementById('statement-input-container');
        const statementInput = document.getElementById('statement-input');


        let inferenceList = [];
        let currentInferenceIndex = 0;
        let lastAnalyzedTextForInference = "";

        let mainIdeaList = [];
        let currentMainIdeaIndex = 0;
        let lastAnalyzedTextForMainIdea = "";

        let vocabList = [];
        let currentVocabIndex = 0;
        let lastAnalyzedTextForVocab = "";

        let lastAnalyzedText = "";

        const restateTypes = [
            { id: 'passiveVoice', name: 'Using Passive Voice', prompt: "You are an expert linguist. Your task is to paraphrase a given sentence in English **using only the passive voice**. First, provide the rewritten sentence in English. Then, in a new paragraph labeled '*Penjelasan:*', explain in Indonesian exactly how the subject and object were swapped to create the passive voice." },
            { id: 'indirectSpeech', name: 'As Indirect Speech', prompt: "You are an expert linguist. Your task is to paraphrase a given sentence in English **as if it were being reported (indirect speech)**. First, provide the rewritten sentence in English. Then, in a new paragraph labeled '*Penjelasan:*', explain in Indonesian how the sentence was changed to reported speech, mentioning changes in tense or pronouns if applicable." },
            { id: 'swappingSynonyms', name: 'Swapping Synonyms', prompt: "You are an expert linguist. Your task is to paraphrase a given sentence in English **by swapping key words with appropriate synonyms**. First, provide the rewritten sentence in English. Then, in a new paragraph labeled '*Penjelasan:*', list in Indonesian the original words and the synonyms you used to replace them. For example: 'mengubah X menjadi Y, dan A menjadi B'." },
            { id: 'changingStructure', name: 'Changing Structure', prompt: "You are an expert linguist. Your task is to paraphrase a given sentence in English **by significantly changing the clause order or. overall sentence structure** while preserving the meaning. First, provide the rewritten sentence in English. Then, in a new paragraph labeled '*Penjelasan:*', describe in Indonesian how the sentence structure was altered, for example, by moving a subordinate clause to the beginning." }
        ];
        let restateUsageHistory = [];
        let restateTypeWeights = {};

        function initializeRestateWeights() {
            restateTypes.forEach(type => {
                restateTypeWeights[type.id] = 10;
            });
            restateUsageHistory = [];
        }

        function updateRestateWeights(usedTypeId) {
            restateUsageHistory.push(usedTypeId);
            if (restateUsageHistory.length >= restateTypes.length) {
                initializeRestateWeights();
                return;
            }
            const UNUSED_WEIGHT = 10;
            const BASE_USED_WEIGHT = 1;
            const historyReversed = [...restateUsageHistory].reverse();
            restateTypes.forEach(type => {
                const historyIndex = historyReversed.indexOf(type.id);
                restateTypeWeights[type.id] = (historyIndex === -1) ? UNUSED_WEIGHT : BASE_USED_WEIGHT + (2 * historyIndex);
            });
        }

        function selectRestateType() {
            const totalWeight = Object.values(restateTypeWeights).reduce((sum, weight) => sum + weight, 0);
            let random = Math.random() * totalWeight;
            for (const type of restateTypes) {
                random -= restateTypeWeights[type.id];
                if (random <= 0) {
                    return type;
                }
            }
            return restateTypes[0];
        }
        initializeRestateWeights();

        const systemPrompts = {
            mainIdea: `You are an expert reading comprehension assistant. Your task is to identify the topic and main idea of the provided text.
First, identify the single **Topic** of the text (1-3 words, in English).
Then, generate 3-4 *different* paraphrased versions of the main idea. Each version must be accurate, have a different sentence structure, and use different synonyms where possible.

For each version, you MUST follow this exact format, using Markdown for spacing:

**Topic:**
[State the single topic here, in English]

**Main Idea:**
[State the paraphrased main idea in a single, clear, and concise **English** sentence.]

**Penjelasan:**
[Provide a **detailed** explanation in **Indonesian** for why this is the main idea. You **must** cite specific phrases or sentences from the text as evidence to support your analysis.]

Separate each complete main idea block with '|||'. Do not add any other text, numbering, or bullet points.
`,
            inference: `You are a highly skilled critical thinking expert, a master of "reading between the lines". Your task is to find 3-4 *deep, logical inferences* from the provided text and present them as a JSON array.

An inference is a logical conclusion based on evidence; it is **NOT** just a paraphrase of the quote. It is **NOT** something the text says directly. It is a logical leap.

You MUST format your entire response as a single, valid JSON array. Do not include any text outside the array, including "json" or backticks.
Each object in the array must have the following structure:
{
  "quote": "The single, specific sentence or phrase from the original text (in English) that acts as the evidence.",
  "clue": "A short hint or 'clue' in **Indonesian** that points the user's attention to *why* the quote is important for making a logical leap. **If you mention specific words from the quote, keep those words in English and wrap them in single quotes.** (e.g., 'Perhatikan penggunaan kata 'suddenly' yang menyiratkan kejadian tak terduga.')",
  "inference": "The final logical conclusion (the implied meaning) in **English**. **This MUST be a new insight that is *implied* by the quote, not just a restatement of it.**",
  "explanation": "A detailed explanation in **Indonesian** that clearly connects the 'quote' and the 'clue' to the 'inference'. It must explain *how* you made the logical leap."
}
Ensure all strings are properly escaped within the JSON.
`,
            trueFalse: `You are an expert reading comprehension and fact-checking assistant. Your task is to analyze the provided text and determine if the user's statement is True or False based *only* on the information given in the text.

You MUST format your entire response as a single, valid JSON object. Do not include any text outside the object, including "json" or backticks.
The JSON object must have the following structure:
{
  "statement": "The user's statement that you evaluated (in English).",
  "result": "True" | "False",
  "quote": "The single, most relevant sentence or phrase from the original text (in English) that directly supports your True/False conclusion. If no single quote directly supports it (especially for False), briefly state why (e.g., 'Text does not mention this topic.')",
  "explanation": "A concise explanation in **Indonesian** clearly stating *why* the statement is True or False based on the provided quote or lack thereof in the text."
}
Ensure all strings are properly escaped within the JSON. Base your judgment solely on the provided text.
`,
            summary: "You are an expert reading comprehension assistant. Your task is to create a concise summary of the provided text. The summary should capture the key points and be no more than three sentences long.",
            tone: "You are an expert literary analyst. Your task is to identify the tone of the provided text. First, state the primary tone in one or two words (e.g., 'Formal and Objective', 'Nostalgic and Melancholy'). Then, in a new paragraph, provide a brief explanation with specific examples from the text to support your analysis. Provide the explanation in Indonesian.",
            purpose: "You are an expert rhetorical analyst. Your task is to determine the primary purpose of the provided text. State whether the purpose is to inform, persuade, entertain, or something else. Then, in a new paragraph, explain your reasoning using evidence from the text. Provide the explanation in Indonesian.",
            genre: "You are an expert in literary and textual genres. Your task is to identify the most likely genre of the provided text (e.g., 'News Report', 'Science Fiction Short Story', 'Personal Essay', 'Technical Manual'). In a new paragraph, briefly justify your choice based on the text's style, content, and structure. Provide the justification in Indonesian.",
            wordMeaning: `You are an expert lexicographer and reading comprehension assistant. Your task is to analyze the provided text based on the user's request.

You MUST format your entire response as a single, valid JSON array. Do not include any text outside the array, including "json" or backticks.

IF THE USER PROVIDES A SPECIFIC "WORD TO ANALYZE":
You must analyze **only that word**. The JSON array will contain a **single object** with this structure:
{
  "word": "The specific word the user asked for (in English).",
  "definition": "A simple, dictionary-style definition of the word in **English**.",
  "quote": "The full sentence from the text where the word appears. You MUST bold the word using Markdown, like this: 'The quick **brown** fox...'.",
  "explanation": "A detailed contextual explanation in **Indonesian** of what the word means *specifically within the context of that quote*."
}

IF THE "WORD TO ANALYZE" IS EMPTY:
You must scan the text and find the 3-5 most important or difficult **Key Vocabulary** words.
The JSON array will contain **multiple objects** (one for each word) using the *exact same structure* as above.

Ensure all strings are properly escaped within the JSON.
`,
        };

        const resultTitles = {
            mainIdea: "Main Idea",
            summary: "Summary",
            inference: "Inference",
            trueFalse: "True or False?",
            tone: "Author's Tone",
            purpose: "Author's Purpose",
            genre: "Text Genre",
            wordMeaning: "Word Meaning Analysis"
        };


        taskSelect.addEventListener('change', () => {
            const selectedTask = taskSelect.value;
            wordInputContainer.classList.toggle('hidden', selectedTask !== 'wordMeaning');
            sentenceInputContainer.classList.toggle('hidden', selectedTask !== 'restateSentence');
            statementInputContainer.classList.toggle('hidden', selectedTask !== 'trueFalse');
        });

        function setLoading(isLoading) {
            analyzeBtn.disabled = isLoading;
            if (isLoading) {
                resultsContainer.innerHTML = `
                    <div id="loading-indicator" class="text-center p-6 bg-white rounded-xl shadow-md border-blue-200">
                        <div class="flex justify-center items-center space-x-2">
                            <div class="w-2 h-2 bg-blue-500 rounded-full animate-pulse" style="animation-delay: -0.3s;"></div>
                            <div class="w-2 h-2 bg-blue-500 rounded-full animate-pulse" style="animation-delay: -0.15s;"></div>
                            <div class="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                        </div>
                        <p class="mt-3 text-gray-600 text-sm">Analyzing text...</p>
                    </div>
                `;
            } else {
                const loadingIndicator = document.getElementById('loading-indicator');
                if (loadingIndicator) loadingIndicator.remove();
            }
        }

        function displayResult(title, content, options = {}) {
            resultsContainer.innerHTML = '';
            const card = document.createElement('div');
            card.className = 'result-card bg-white p-6 rounded-2xl shadow-lg border border-blue-200';

            let formattedContent = "";
            let isFallback = options && options.isFallback;

            if ((title.startsWith("Key Vocabulary") || title === "Word Meaning Analysis") && typeof content === 'object' && content !== null && !isFallback) {
                const formattedQuote = content.quote.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
                formattedContent = `
                    <div class="space-y-4">
                        <div>
                            <strong class="block text-gray-800">Word:</strong>
                            <p class="mt-1 text-xl font-semibold text-blue-700">${content.word}</p>
                        </div>
                        <div>
                            <strong class="block text-gray-800">Definition:</strong>
                            <p class="mt-1">${content.definition}</p>
                        </div>
                        <div>
                            <strong class="block text-gray-800">Quote from Text:</strong>
                            <p class="mt-1 italic">"${formattedQuote}"</p>
                        </div>
                        <div>
                            <strong class="block text-gray-800">Contextual Explanation (Penjelasan Kontekstual):</strong>
                            <p class="mt-1">${content.explanation}</p>
                        </div>
                    </div>
                `;
            } else if (title.startsWith("Inference") && typeof content === 'object' && content !== null && !isFallback) {
                formattedContent = `
                    <div class="space-y-4">
                        <div>
                            <strong class="block text-gray-800">Quote from Text:</strong>
                            <p class="mt-1 italic">"${content.quote}"</p>
                        </div>
                        <div>
                            <strong class="block text-gray-800">Clue (Petunjuk):</strong>
                            <p class="mt-1">${content.clue}</p>
                        </div>
                        <button id="show-inference-btn" class="mt-2 bg-blue-100 text-blue-700 font-semibold py-2 px-4 rounded-lg hover:bg-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition duration-200">
                            Show Inference
                        </button>
                        <div id="inference-reveal" class="hidden space-y-4 mt-4 pt-4 border-t border-gray-200">
                            <div>
                                <strong class="block text-gray-800">Inference:</strong>
                                <p class="mt-1 font-semibold text-blue-700">${content.inference}</p>
                            </div>
                            <div>
                                <strong class="block text-gray-800">Explanation (Penjelasan):</strong>
                                <p class="mt-1">${content.explanation}</p>
                            </div>
                        </div>
                    </div>
                `;
            } else if (title === "True or False?" && typeof content === 'object' && content !== null && !isFallback) {
                 const resultClass = content.result === "True" ? "result-true" : "result-false";
                 formattedContent = `
                     <div class="space-y-4">
                         <div>
                             <strong class="block text-gray-800">Statement:</strong>
                             <p class="mt-1 italic">"${content.statement}"</p>
                         </div>
                         <div>
                             <strong class="block text-gray-800">Result:</strong>
                             <p class="mt-1 text-xl ${resultClass}">${content.result}</p>
                         </div>
                         <div>
                             <strong class="block text-gray-800">Evidence from Text:</strong>
                             <p class="mt-1 italic">"${content.quote}"</p>
                         </div>
                         <div>
                             <strong class="block text-gray-800">Explanation (Penjelasan):</strong>
                             <p class="mt-1">${content.explanation}</p>
                         </div>
                     </div>
                 `;
            } else {
                formattedContent = (typeof content === 'string' ? content : 'Error: Invalid content format')
                    .replace(/\n\n/g, '<br><br>')
                    .replace(/\n/g, '<br>')
                    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                    .replace(/\*(.*?)\*/g, '<em>$1</em>');
            }

            card.innerHTML = `
                <h2 class="text-2xl font-bold text-blue-700 mb-4">${title}</h2>
                <div class="text-gray-700 leading-relaxed space-y-4">${formattedContent}</div>
            `;

            const showInferenceBtn = card.querySelector('#show-inference-btn');
            if (showInferenceBtn) {
                showInferenceBtn.addEventListener('click', () => {
                    const revealSection = card.querySelector('#inference-reveal');
                    if (revealSection) {
                        revealSection.classList.remove('hidden');
                        showInferenceBtn.classList.add('hidden');
                    }
                });
            }

            if (title === "Author's Tone") {
                const rewriteSection = document.createElement('div');
                rewriteSection.className = 'mt-6 pt-6 border-t border-gray-200';
                rewriteSection.innerHTML = `
                    <h3 class="text-lg font-semibold text-gray-800 mb-3">Rewrite Text in a New Tone</h3>
                    <div class="space-y-3" id="rewrite-controls-container">
                        <select id="card-tone-category-select" class="w-full p-2 border border-blue-300 rounded-lg bg-blue-100 text-gray-800">
                            <option value="">-- Select Tone Category --</option>
                            <option value="positive">Positive</option>
                            <option value="negative">Negative</option>
                            <option value="neutral">Neutral</option>
                            <option value="custom">Custom</option>
                        </select>
                        <select id="card-positive-tones-select" class="hidden w-full p-2 border border-blue-300 rounded-lg bg-blue-100 text-gray-800">
                            <option value="Joyful">Joyful</option>
                            <option value="Enthusiastic">Enthusiastic</option>
                            <option value="Hopeful">Hopeful</option>
                            <option value="Optimistic">Optimistic</option>
                            <option value="Friendly">Friendly</option>
                        </select>
                        <select id="card-negative-tones-select" class="hidden w-full p-2 border border-blue-300 rounded-lg bg-blue-100 text-gray-800">
                            <option value="Sad">Sad</option>
                            <option value="Angry">Angry</option>
                            <option value="Critical">Critical</option>
                            <option value="Pessimistic">Pessimistic</option>
                            <option value="Skeptical">Skeptical</option>
                        </select>
                        <select id="card-neutral-tones-select" class="hidden w-full p-2 border border-blue-300 rounded-lg bg-blue-100 text-gray-800">
                            <option value="Formal">Formal</option>
                            <option value="Objective">Objective</option>
                            <option value="Informative">Informative</option>
                            <option value="Analytical">Analytical</option>
                            <option value="Neutral">Neutral</option>
                        </select>
                        <div id="card-custom-tone-input-container" class="hidden">
                            <label for="card-tone-rewrite-input" class="block text-sm font-medium text-gray-600 mb-1">Enter custom tone:</label>
                            <input type="text" id="card-tone-rewrite-input" class="w-full p-2 border border-blue-300 rounded-lg bg-blue-100 text-gray-800 placeholder-gray-500" placeholder="e.g., sarcastic, whimsical">
                        </div>
                        <button id="rewrite-tone-btn" class="w-full bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-transform duration-200 transform hover:scale-105">
                            Rewrite Text
                        </button>
                    </div>
                    <div id="rewrite-result-container" class="mt-4"></div>
                `;
                card.appendChild(rewriteSection);

                const categorySelect = card.querySelector('#card-tone-category-select');
                const positiveSelect = card.querySelector('#card-positive-tones-select');
                const negativeSelect = card.querySelector('#card-negative-tones-select');
                const neutralSelect = card.querySelector('#card-neutral-tones-select');
                const customInput = card.querySelector('#card-custom-tone-input-container');
                const rewriteBtn = card.querySelector('#rewrite-tone-btn');
                const rewriteResultContainer = card.querySelector('#rewrite-result-container');

                categorySelect.addEventListener('change', () => {
                    const category = categorySelect.value;
                    positiveSelect.classList.toggle('hidden', category !== 'positive');
                    negativeSelect.classList.toggle('hidden', category !== 'negative');
                    neutralSelect.classList.toggle('hidden', category !== 'neutral');
                    customInput.classList.toggle('hidden', category !== 'custom');
                });

                rewriteBtn.addEventListener('click', async () => {
                    const category = categorySelect.value;
                    let desiredTone = "";

                    if (category === 'positive') desiredTone = positiveSelect.value;
                    else if (category === 'negative') desiredTone = negativeSelect.value;
                    else if (category === 'neutral') desiredTone = neutralSelect.value;
                    else if (category === 'custom') desiredTone = card.querySelector('#card-tone-rewrite-input').value.trim();

                    if (desiredTone && lastAnalyzedText) {
                        rewriteResultContainer.innerHTML = `
                            <div class="text-center p-4 border rounded-lg bg-blue-50">
                                <div class="flex justify-center items-center space-x-2">
                                     <div class="w-2 h-2 bg-blue-500 rounded-full animate-pulse" style="animation-delay: -0.3s;"></div>
                                     <div class="w-2 h-2 bg-blue-500 rounded-full animate-pulse" style="animation-delay: -0.15s;"></div>
                                     <div class="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                                </div>
                                <p class="mt-3 text-gray-600 text-sm">Rewriting text...</p>
                            </div>
                        `;
                        rewriteBtn.disabled = true;

                        const aiContent = await fetchToneRewrite(lastAnalyzedText, desiredTone);

                        if (aiContent) {
                            let formattedContent = aiContent
                                .replace(/\n\n/g, '<br><br>')
                                .replace(/\n/g, '<br>')
                                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                                .replace(/\*(.*?)\*/g, '<em>$1</em>')
                                .replace(/\[ORIGINAL\](.*?)\[\/ORIGINAL\]/g,
                                    '<span class="block mt-2"><span class="font-medium text-red-700">Original:</span> <span class="bg-red-100 text-red-900 p-1 rounded font-mono">"$1"</span></span>')
                                .replace(/\[MENJADI\](.*?)\[\/MENJADI\]/g,
                                    '<span class="block mb-2"><span class="font-medium text-green-700">Menjadi:</span> <span class="bg-green-100 text-green-900 p-1 rounded font-mono">"$1"</span></span>');

                            rewriteResultContainer.innerHTML = `
                                <h4 class="text-md font-semibold text-blue-600 mb-2">Rewritten Text (Tone: ${desiredTone})</h4>
                                <div class="text-gray-700 leading-relaxed space-y-4 p-4 border rounded-lg bg-blue-50/50">
                                    ${formattedContent}
                                </div>
                            `;
                        } else {
                            rewriteResultContainer.innerHTML = `
                                <div class="bg-red-100 border border-red-200 text-red-700 p-3 rounded-lg" role="alert">
                                    <p>Error rewriting text. Please try again.</p>
                                </div>
                            `;
                        }
                        rewriteBtn.disabled = false;

                    } else {
                        console.log("No rewrite tone selected or original text missing.");
                        rewriteResultContainer.innerHTML = `<p class="text-red-600 text-sm">Please select a tone to rewrite into.</p>`;
                    }
                });
            }

            resultsContainer.appendChild(card);
        }

        function displayError(message) {
            resultsContainer.innerHTML = `
                <div class="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 rounded-lg" role="alert">
                    <p class="font-bold">An error occurred</p>
                    <p>${message}</p>
                </div>
            `;
        }


        async function fetchToneRewrite(text, desiredTone) {
            const apiKey = "AIzaSyCFx0aN9Z7UaZDbH1WxaT2ILQBSGO3uIAw";
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;

            const systemPrompt = `You are an expert creative writer and editor. Your task is to rewrite the provided text to match a new, specified tone.

Please format your response exactly as follows, using Markdown:

**Rewritten Text**
[The full rewritten text in English goes here.]

**Penjelasan Perubahan (Explanation of Changes)**
[Provide an explanation in **Indonesian** describing *how* the tone was shifted (e.g., word choice, sentence structure).]

**Perubahan Utama (Key Changes)**
[List the most significant word or phrase changes. Use this exact format, replacing the brackets and text inside:]
* [ORIGINAL]original phrase 1[/ORIGINAL]
* [MENJADI]rewritten phrase 1[/MENJADI]
* [ORIGINAL]original phrase 2[/ORIGINAL]
* [MENJADI]rewritten phrase 2[/MENJADI]
`;
            const userPrompt = `ORIGINAL TEXT: """${text}"""\n\nTARGET TONE: "${desiredTone}"`;

            const payload = {
                contents: [{ parts: [{ text: userPrompt }] }],
                systemInstruction: { parts: [{ text: systemPrompt }] },
                generationConfig: {
                    temperature: 0.0,
                }
            };

            let response;
            let retries = 0;
            const maxRetries = 3;
            let delay = 1000;

            while (retries < maxRetries) {
                try {
                    response = await fetch(apiUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });

                    if (response.ok) break;

                    if (response.status === 429 || response.status >= 500) {
                        await new Promise(resolve => setTimeout(resolve, delay));
                        delay *= 2;
                        retries++;
                    } else {
                        throw new Error(`API Error: ${response.statusText} (Status: ${response.status})`);
                    }
                } catch (error) {
                     if (!error.message.startsWith('API Error')) {
                        await new Promise(resolve => setTimeout(resolve, delay));
                        delay *= 2;
                        retries++;
                     } else {
                        console.error("Non-retryable API error:", error);
                        break;
                     }
                }
            }

            if (!response || !response.ok) {
                console.error("Error calling Gemini API after retries:", response ? `${response.status} ${response.statusText}` : "No response or network error");
                return null;
            }

            try {
                const result = await response.json();
                const aiText = result.candidates?.[0]?.content?.parts?.[0]?.text;
                return aiText || null;
            } catch (error) {
                console.error("Error processing API response:", error);
                return null;
            }
        }

        async function getAIAnalysis(text, task, additionalInput = "") {
            setLoading(true);

            const apiKey = "AIzaSyCFx0aN9Z7UaZDbH1WxaT2ILQBSGO3uIAw";
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;

            let systemPrompt, userPrompt = text, resultTitle;

            if (task === 'restateSentence') {
                const selectedType = selectRestateType();
                systemPrompt = selectedType.prompt;
                userPrompt = `TEXT: """${text}"""\n\nSENTENCE TO RESTATE: "${additionalInput}"`;
                resultTitle = `Restated Sentence (${selectedType.name})`;
                updateRestateWeights(selectedType.id);
            } else if (task === 'wordMeaning') {
                systemPrompt = systemPrompts.wordMeaning;
                if (additionalInput) {
                    userPrompt = `TEXT: """${text}"""\n\nWORD TO ANALYZE: "${additionalInput}"`;
                    resultTitle = "Word Meaning Analysis";
                } else {
                    userPrompt = `TEXT: """${text}"""\n\nWORD TO ANALYZE: ""`;
                    resultTitle = "Key Vocabulary";
                }
            } else if (task === 'trueFalse') {
                systemPrompt = systemPrompts.trueFalse;
                userPrompt = `TEXT: """${text}"""\n\nSTATEMENT TO EVALUATE: "${additionalInput}"`;
                resultTitle = resultTitles.trueFalse;
            } else {
                 systemPrompt = systemPrompts[task];
                 resultTitle = resultTitles[task];
            }

            const payload = {
                contents: [{ parts: [{ text: userPrompt }] }],
                systemInstruction: { parts: [{ text: systemPrompt }] },
                generationConfig: {
                    temperature: 0.0,
                    ...( (task === 'inference' || task === 'wordMeaning' || task === 'trueFalse') && { responseMimeType: "application/json" } )
                }
            };

             if (task === 'inference') {
                 payload.generationConfig.responseSchema = {
                     type: "ARRAY",
                     items: {
                         type: "OBJECT",
                         properties: {
                             "quote": { "type": "STRING" },
                             "clue": { "type": "STRING" },
                             "inference": { "type": "STRING" },
                             "explanation": { "type": "STRING" }
                         },
                         required: ["quote", "clue", "inference", "explanation"]
                     }
                 };
             } else if (task === 'wordMeaning') {
                 payload.generationConfig.responseSchema = {
                     type: "ARRAY",
                     items: {
                         type: "OBJECT",
                         properties: {
                             "word": { "type": "STRING" },
                             "definition": { "type": "STRING" },
                             "quote": { "type": "STRING" },
                             "explanation": { "type": "STRING" }
                         },
                         required: ["word", "definition", "quote", "explanation"]
                     }
                 };
             } else if (task === 'trueFalse') {
                 payload.generationConfig.responseSchema = {
                     type: "OBJECT",
                     properties: {
                         "statement": { "type": "STRING" },
                         "result": { "type": "STRING", "enum": ["True", "False"] },
                         "quote": { "type": "STRING" },
                         "explanation": { "type": "STRING" }
                     },
                     required: ["statement", "result", "quote", "explanation"]
                 };
             }


            let response;
            let retries = 0;
            const maxRetries = 3;
            let delay = 1000;

            while (retries < maxRetries) {
                try {
                    response = await fetch(apiUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });

                    if (response.ok) break;

                    if (response.status === 429 || response.status >= 500) {
                        await new Promise(resolve => setTimeout(resolve, delay));
                        delay *= 2;
                        retries++;
                    } else {
                        throw new Error(`API Error: ${response.statusText} (Status: ${response.status})`);
                    }

                } catch (error) {
                    if (error.message.startsWith('API Error')) {
                        console.error("Non-retryable API error:", error);
                        displayError(`Analysis failed: ${error.message}. Please check your input or try again later.`);
                        setLoading(false);
                        return;
                    }
                    await new Promise(resolve => setTimeout(resolve, delay));
                    delay *= 2;
                    retries++;
                }
            }

            if (!response || !response.ok) {
                console.error("Error calling Gemini API after retries:", response ? `${response.status} ${response.statusText}` : "No response or network error");
                let errorMsg = "I seem to be having trouble analyzing the text after multiple attempts. Please try again in a moment.";
                if(response) {
                    try {
                        const errorBody = await response.json();
                        console.error("API Error Body:", errorBody);
                        errorMsg = `API Error (${response.status}): ${errorBody?.error?.message || response.statusText}. Please check the console for details.`;
                    } catch(e) {
                         errorMsg = `API Error (${response.status}): ${response.statusText}. Could not parse error response.`;
                    }
                }
                displayError(errorMsg);
                setLoading(false);
                return;
            }

            try {
                const result = await response.json();

                if (!result.candidates || result.candidates.length === 0 || !result.candidates[0].content || !result.candidates[0].content.parts || result.candidates[0].content.parts.length === 0) {
                    let finishReason = result.candidates?.[0]?.finishReason;
                    let safetyRatings = result.candidates?.[0]?.safetyRatings;
                    console.warn("API returned no valid content. Finish Reason:", finishReason, "Safety Ratings:", safetyRatings);
                    let errorReason = "The AI response was empty.";
                    if (finishReason === "SAFETY") {
                        errorReason = "The request or response was blocked due to safety concerns.";
                    } else if (finishReason === "RECITATION") {
                        errorReason = "The response was blocked due to potential recitation issues.";
                    } else if (finishReason) {
                        errorReason = `Analysis stopped unexpectedly (Reason: ${finishReason}).`;
                    }
                    displayError(errorReason);
                    setLoading(false);
                    return;
                }

                const aiText = result.candidates[0].content.parts[0].text;

                if (aiText) {
                    if (task === 'wordMeaning' || task === 'inference' || task === 'trueFalse') {
                        let parsedData;
                        let parseError = null;
                        try {
                            parsedData = JSON.parse(aiText);
                            if (task === 'wordMeaning' || task === 'inference') {
                                if (!Array.isArray(parsedData) || parsedData.length === 0) throw new Error("Parsed JSON is not a valid array or is empty.");
                                if (task === 'wordMeaning' && (!parsedData[0].word || !parsedData[0].definition || !parsedData[0].quote || !parsedData[0].explanation)) throw new Error("Vocab JSON items missing properties.");
                                if (task === 'inference' && (!parsedData[0].quote || !parsedData[0].clue || !parsedData[0].inference || !parsedData[0].explanation)) throw new Error("Inference JSON items missing properties.");
                            } else {
                                if (typeof parsedData !== 'object' || parsedData === null || !parsedData.statement || !parsedData.result || !parsedData.quote || !parsedData.explanation) throw new Error("True/False JSON missing properties.");
                            }
                        } catch (error) {
                            console.error(`Failed to parse expected JSON for task '${task}':`, error.message, "\nRaw AI Text:", aiText);
                            parseError = error;
                        }

                        if (!parseError) {
                            if (task === 'wordMeaning') {
                                vocabList = parsedData;
                                lastAnalyzedTextForVocab = text;
                                currentVocabIndex = 0;
                                let title = vocabList.length > 1 ? `Key Vocabulary (${currentVocabIndex + 1} of ${vocabList.length})` : "Word Meaning Analysis";
                                displayResult(title, vocabList[currentVocabIndex]);
                            } else if (task === 'inference') {
                                inferenceList = parsedData;
                                lastAnalyzedTextForInference = text;
                                currentInferenceIndex = 0;
                                const title = `Inference (${currentInferenceIndex + 1} of ${inferenceList.length})`;
                                displayResult(title, inferenceList[currentInferenceIndex]);
                            } else {
                                displayResult(resultTitle, parsedData);
                            }
                        } else {
                            console.warn(`Using fallback display for task '${task}' due to JSON parse error.`);
                            displayResult(resultTitles[task] || "Analysis Result", aiText, { isFallback: true });
                        }
                    } else if (task === 'mainIdea') {
                        mainIdeaList = aiText.split('|||').map(item => item.trim()).filter(item => item !== '');
                        lastAnalyzedTextForMainIdea = text;
                        if (mainIdeaList.length > 0) {
                            currentMainIdeaIndex = 0;
                            const title = `Main Idea`;
                            displayResult(title, mainIdeaList[currentMainIdeaIndex]);
                        } else {
                            console.warn("Main Idea response parsing failed or was empty:", aiText);
                            displayResult("Main Idea", "The AI could not find distinct main idea versions for the provided text.");
                        }
                    } else {
                        displayResult(resultTitle, aiText);
                    }
                } else {
                     console.warn("API response candidate part had no text.");
                     throw new Error("The AI returned an empty response part.");
                }
            } catch (error) {
                console.error("Error processing API response:", error);
                 let rawResponseText = "Could not read raw response.";
                 try { rawResponseText = await response.text(); } catch(e) {/* ignore */}
                 console.error("Raw Response:", rawResponseText);
                displayError(`There was an issue processing the AI's response: ${error.message}. Please check the console for details.`);
            } finally {
                setLoading(false);
            }
        }

        analyzeBtn.addEventListener('click', () => {
            let task = taskSelect.value;
            const text = textInput.value.trim();


            if (!text) {
                displayError("Please paste some text into the box before choosing an analysis.");
                return;
            }

            let additionalInput = "";

            let shouldCycle = false;
            if (text === lastAnalyzedText) {
                 if (task === 'mainIdea' && text === lastAnalyzedTextForMainIdea && mainIdeaList.length > 0) {
                     currentMainIdeaIndex = (currentMainIdeaIndex + 1) % mainIdeaList.length;
                     const title = `Main Idea`;
                     displayResult(title, mainIdeaList[currentMainIdeaIndex]);
                     shouldCycle = true;
                 } else if (task === 'inference' && text === lastAnalyzedTextForInference && inferenceList.length > 0) {
                     currentInferenceIndex = (currentInferenceIndex + 1) % inferenceList.length;
                     const title = `Inference (${currentInferenceIndex + 1} of ${inferenceList.length})`;
                     const item = inferenceList[currentInferenceIndex];
                     let isFallback = (typeof item === 'string');
                     displayResult(title, item, { isFallback: isFallback });
                     shouldCycle = true;
                 } else if (task === 'wordMeaning' && text === lastAnalyzedTextForVocab) {
                      additionalInput = wordInput.value.trim();
                      if(additionalInput === "" && vocabList.length > 0) {
                          currentVocabIndex = (currentVocabIndex + 1) % vocabList.length;
                          const title = `Key Vocabulary (${currentVocabIndex + 1} of ${vocabList.length})`;
                          displayResult(title, vocabList[currentVocabIndex]);
                          shouldCycle = true;
                      }
                 }
            }

            if (shouldCycle) {
                return;
            }

             lastAnalyzedText = text;

             if (task !== 'mainIdea' || text !== lastAnalyzedTextForMainIdea) {
                 mainIdeaList = []; currentMainIdeaIndex = 0;
             }
             if (task !== 'inference' || text !== lastAnalyzedTextForInference) {
                 inferenceList = []; currentInferenceIndex = 0;
             }
             additionalInput = wordInput.value.trim();
             if (task !== 'wordMeaning' || text !== lastAnalyzedTextForVocab || additionalInput !== "") {
                  vocabList = []; currentVocabIndex = 0;
             }
             if (task === 'mainIdea') lastAnalyzedTextForMainIdea = text;
             if (task === 'inference') lastAnalyzedTextForInference = text;
             if (task === 'wordMeaning') lastAnalyzedTextForVocab = text;


            if (task === 'restateSentence') {
                additionalInput = sentenceInput.value.trim();
                 if (!additionalInput) {
                     displayError("Please enter a sentence to restate.");
                     return;
                 }
            } else if (task === 'wordMeaning') {
                 additionalInput = wordInput.value.trim();
            } else if (task === 'trueFalse') {
                 additionalInput = statementInput.value.trim();
                 if (!additionalInput) {
                     displayError("Please enter a statement to check for True or False.");
                     return;
                 }
            } else {
                 additionalInput = "";
            }

            getAIAnalysis(text, task, additionalInput);
        });

        // --- START: Text Detective Logic ---

        // NEW textPairs Array with REDACTIONS ADDED BACK
        const textPairs = [
            { // Ex 1: Renewable Energy
                textA: {
                    redacted: "<strong>Solar power</strong> <code>&nbsp;&nbsp;&nbsp;</code> <strong>energy</strong> from the <strong>sun</strong> using <code>&nbsp;&nbsp;&nbsp;</code> panels. It's a <strong>clean</strong> source, <code>&nbsp;&nbsp;&nbsp;</code> no <code>&nbsp;&nbsp;&nbsp;</code> emissions during <code>&nbsp;&nbsp;&nbsp;</code>. The <strong>cost</strong> of solar panels has <code>&nbsp;&nbsp;&nbsp;</code> significantly, making it <code>&nbsp;&nbsp;&nbsp;</code> competitive with <strong>fossil fuels</strong> in many <code>&nbsp;&nbsp;&nbsp;</code>. <code>&nbsp;&nbsp;&nbsp;</code>, its main <code>&nbsp;&nbsp;&nbsp;</code> is <strong>intermittency</strong> – it only <code>&nbsp;&nbsp;&nbsp;</code> <strong>power</strong> when the <strong>sun</strong> is shining, <code>&nbsp;&nbsp;&nbsp;</code> energy storage solutions like <code>&nbsp;&nbsp;&nbsp;</code>.<br><br><code>&nbsp;&nbsp;&nbsp;</code> large-scale solar farms and rooftop <code>&nbsp;&nbsp;&nbsp;</code> <code>&nbsp;&nbsp;&nbsp;</code> to the grid. The technology is <code>&nbsp;&nbsp;&nbsp;</code> improving in <code>&nbsp;&nbsp;&nbsp;</code> and durability. <strong>Government</strong> <code>&nbsp;&nbsp;&nbsp;</code> often <code>&nbsp;&nbsp;&nbsp;</code> its adoption.",
                    full: "Solar power harnesses energy from the sun using photovoltaic panels. It's a clean source, producing no greenhouse gas emissions during operation. The cost of solar panels has decreased significantly, making it increasingly competitive with fossil fuels in many regions. However, its main drawback is intermittency – it only generates power when the sun is shining, necessitating energy storage solutions like batteries.\n\nBoth large-scale solar farms and rooftop installations contribute to the grid. The technology is constantly improving in efficiency and durability. Government incentives often encourage its adoption."
                },
                textB: {
                    redacted: "<strong>Wind power</strong> uses <code>&nbsp;&nbsp;&nbsp;</code> to <code>&nbsp;&nbsp;&nbsp;</code> the kinetic <strong>energy</strong> of wind into <strong>electricity</strong>. Like solar, it's a <strong>clean</strong> <strong>energy</strong> source with <code>&nbsp;&nbsp;&nbsp;</code> operational emissions. Wind farms, often <code>&nbsp;&nbsp;&nbsp;</code> in open areas or <code>&nbsp;&nbsp;&nbsp;</code>, can generate <code>&nbsp;&nbsp;&nbsp;</code> amounts of <strong>power</strong>. <code>&nbsp;&nbsp;&nbsp;</code>, wind is also <code>&nbsp;&nbsp;&nbsp;</code> – turbines only <code>&nbsp;&nbsp;&nbsp;</code> when the wind blows within a certain speed <code>&nbsp;&nbsp;&nbsp;</code>. <code>&nbsp;&nbsp;&nbsp;</code> storage is often <code>&nbsp;&nbsp;&nbsp;</code> for grid stability.<br><br><code>&nbsp;&nbsp;&nbsp;</code> concerns include visual <code>&nbsp;&nbsp;&nbsp;</code> on landscapes and potential <code>&nbsp;&nbsp;&nbsp;</code> to birds, though newer turbine designs aim to <code>&nbsp;&nbsp;&nbsp;</code> these issues. <strong>Wind power</strong> is a <code>&nbsp;&nbsp;&nbsp;</code> component of many countries' renewable energy strategies.",
                    full: "Wind power uses turbines to convert the kinetic energy of wind into electricity. Like solar, it's a clean energy source with zero operational emissions. Wind farms, often located in open areas or offshore, can generate substantial amounts of power. Similarly, wind is also intermittent – turbines only operate when the wind blows within a certain speed range. Energy storage is often required for grid stability.\n\nAdditional concerns include visual impact on landscapes and potential harm to birds, though newer turbine designs aim to mitigate these issues. Wind power is a major component of many countries' renewable energy strategies."
                },
                explanation: `
                    <ul>
                        <li><strong>Similarity:</strong> Both texts discuss major forms of <strong>renewable energy</strong> (<strong>solar</strong> and <strong>wind power</strong>), highlighting them as <strong>clean</strong> sources that don't produce operational emissions.</li>
                        <li><strong>Difference:</strong> Text A focuses specifically on <strong>solar power</strong>, mentioning <code>photovoltaic</code> panels, decreasing <code>costs</code>, and rooftop installations. Text B focuses specifically on <strong>wind power</strong>, mentioning <code>turbines</code>, wind farms (<code>offshore</code>), visual impact, and harm to birds.</li>
                        <li><strong>Signal Words:</strong> Text A uses <code>However</code> to introduce the drawback of intermittency. Text B uses <code>Like solar</code> and <code>Similarly</code> to draw parallels regarding cleanliness and intermittency, respectively.</li>
                    </ul>`,
                quiz: {
                    question: "What is a shared challenge mentioned for both solar and wind power?",
                    options: [
                        "High initial cost",
                        "Harm to wildlife",
                        "Intermittency (not always available)",
                        "Requires large land areas"
                    ],
                    correctAnswerIndex: 2 // C
                }
            },
            { // Ex 2: Urban Planning
                textA: {
                    redacted: "<strong>Urban sprawl</strong> refers to the <code>&nbsp;&nbsp;&nbsp;</code> expansion of <code>&nbsp;&nbsp;&nbsp;</code> development <code>&nbsp;&nbsp;&nbsp;</code> from city centers. This pattern often <code>&nbsp;&nbsp;&nbsp;</code> to <code>&nbsp;&nbsp;&nbsp;</code> reliance on <strong>automobiles</strong>, <code>&nbsp;&nbsp;&nbsp;</code> traffic congestion and air pollution. <code>&nbsp;&nbsp;&nbsp;</code>, it consumes large amounts of <code>&nbsp;&nbsp;&nbsp;</code>, often <code>&nbsp;&nbsp;&nbsp;</code> on natural habitats or agricultural areas. Infrastructure <code>&nbsp;&nbsp;&nbsp;</code> (roads, utilities) also <code>&nbsp;&nbsp;&nbsp;</code> to be higher per capita in <code>&nbsp;&nbsp;&nbsp;</code> areas.<br><br><code>&nbsp;&nbsp;&nbsp;</code> often involves single-family homes on large lots with <code>&nbsp;&nbsp;&nbsp;</code> land uses (residential, commercial, <code>&nbsp;&nbsp;&nbsp;</code>). This can <code>&nbsp;&nbsp;&nbsp;</code> <strong>walkability</strong> and reduce community interaction.",
                    full: "Urban sprawl refers to the uncontrolled expansion of low-density development outward from city centers. This pattern often leads to increased reliance on automobiles, worsening traffic congestion and air pollution. Furthermore, it consumes large amounts of land, often encroaching on natural habitats or agricultural areas. Infrastructure costs (roads, utilities) also tend to be higher per capita in sprawling areas.\n\nDevelopment often involves single-family homes on large lots with separated land uses (residential, commercial, industrial). This can decrease walkability and reduce community interaction."
                },
                textB: {
                    redacted: "<strong>Smart growth</strong> principles, <code>&nbsp;&nbsp;&nbsp;</code>, advocate for more <code>&nbsp;&nbsp;&nbsp;</code>, <strong>mixed-use</strong> development. This approach encourages building <code>&nbsp;&nbsp;&nbsp;</code> within existing neighborhoods or designated growth areas. Key <code>&nbsp;&nbsp;&nbsp;</code> include creating <strong>walkable</strong> communities, preserving open space, and providing a wider range of <strong>transportation choices</strong>, including public transit and bike lanes.<br><br>By mixing residential, commercial, and retail spaces, smart growth aims to <code>&nbsp;&nbsp;&nbsp;</code> the need for driving for daily <code>&nbsp;&nbsp;&nbsp;</code>, fostering a stronger sense of place and community. It represents a more <code>&nbsp;&nbsp;&nbsp;</code> approach to accommodate population growth compared to traditional sprawl.",
                    full: "Smart growth principles, in contrast, advocate for more compact, mixed-use development. This approach encourages building 'up' or 'in' within existing neighborhoods or designated growth areas. Key goals include creating walkable communities, preserving open space, and providing a wider range of transportation choices, including public transit and bike lanes.\n\nBy mixing residential, commercial, and retail spaces, smart growth aims to reduce the need for driving for daily errands, fostering a stronger sense of place and community. It represents a more sustainable approach to accommodate population growth compared to traditional sprawl."
                },
                explanation: `
                    <ul>
                        <li><strong>Similarity:</strong> Both texts discuss patterns of <strong>urban development</strong> and how cities grow.</li>
                        <li><strong>Difference:</strong> They describe contrasting approaches. Text A focuses on the negative consequences of <strong>urban sprawl</strong> (<code>low-density</code>, <code>automobile reliance</code>, <code>land consumption</code>). Text B focuses on the positive goals and methods of <strong>smart growth</strong> (<code>compact</code>, <code>mixed-use</code>, <code>walkable</code>, <code>transportation choices</code>).</li>
                        <li><strong>Signal Words:</strong> Text A uses <code>Furthermore</code> to add the point about land consumption. Text B uses <code>in contrast</code> to explicitly position smart growth as an alternative to sprawl.</li>
                    </ul>`,
                quiz: {
                    question: "According to the texts, how does 'Smart Growth' differ from 'Urban Sprawl'?",
                    options: [
                        "Smart growth uses more land per person.",
                        "Smart growth encourages more driving.",
                        "Smart growth focuses on lower density housing.",
                        "Smart growth promotes mixed land uses and walkability."
                    ],
                    correctAnswerIndex: 3 // D
                }
            },
            { // Ex 3: Ancient Civilizations
                textA: {
                    redacted: "The <strong>Ancient Egyptians</strong> developed a complex civilization along the <strong>Nile River</strong>. Their society was <code>&nbsp;&nbsp;&nbsp;</code> <code>&nbsp;&nbsp;&nbsp;</code> by the river's predictable <code>&nbsp;&nbsp;&nbsp;</code>, which enabled successful <code>&nbsp;&nbsp;&nbsp;</code> in an otherwise arid region. They are <code>&nbsp;&nbsp;&nbsp;</code> for monumental architecture like the <strong>pyramids</strong> and temples, <code>&nbsp;&nbsp;&nbsp;</code> religious beliefs centered on the afterlife, and the development of <strong>hieroglyphic writing</strong>.<br><br><strong>Pharaohs</strong>, considered divine rulers, held <code>&nbsp;&nbsp;&nbsp;</code> power. Egyptian society had a rigid social <code>&nbsp;&nbsp;&nbsp;</code> but allowed for some social <code>&nbsp;&nbsp;&nbsp;</code>. Their innovations in mathematics, <code>&nbsp;&nbsp;&nbsp;</code>, and medicine were <code>&nbsp;&nbsp;&nbsp;</code> for their time.",
                    full: "The Ancient Egyptians developed a complex civilization along the Nile River. Their society was heavily influenced by the river's predictable flooding, which enabled successful agriculture in an otherwise arid region. They are renowned for monumental architecture like the pyramids and temples, intricate religious beliefs centered on the afterlife, and the development of hieroglyphic writing.\n\nPharaohs, considered divine rulers, held absolute power. Egyptian society had a rigid social hierarchy but allowed for some social mobility. Their innovations in mathematics, astronomy, and medicine were remarkable for their time."
                },
                textB: {
                    redacted: "<code>&nbsp;&nbsp;&nbsp;</code>, the civilization of <strong>Mesopotamia</strong> emerged between the <strong>Tigris</strong> and <strong>Euphrates rivers</strong>. <code>&nbsp;&nbsp;&nbsp;</code> the unified kingdom of Egypt, Mesopotamia was often characterized by independent, and sometimes <code>&nbsp;&nbsp;&nbsp;</code>, <strong>city-states</strong> like Ur and Babylon. While they also relied on river flooding for agriculture, it was less <code>&nbsp;&nbsp;&nbsp;</code> than the Nile's.<br><br>Mesopotamians are <code>&nbsp;&nbsp;&nbsp;</code> with inventing <strong>cuneiform script</strong> (one of the earliest writing systems), the <code>&nbsp;&nbsp;&nbsp;</code>, and developing early legal codes like the Code of <code>&nbsp;&nbsp;&nbsp;</code>. Their religious beliefs were <code>&nbsp;&nbsp;&nbsp;</code>, with gods often tied to natural forces and cities. Their architectural achievements included <strong>ziggurats</strong> (stepped temples).",
                    full: "Meanwhile, the civilization of Mesopotamia emerged between the Tigris and Euphrates rivers. Unlike the unified kingdom of Egypt, Mesopotamia was often characterized by independent, and sometimes warring, city-states like Ur and Babylon. While they also relied on river flooding for agriculture, it was less predictable than the Nile's.\n\nMesopotamians are credited with inventing cuneiform script (one of the earliest writing systems), the wheel, and developing early legal codes like the Code of Hammurabi. Their religious beliefs were polytheistic, with gods often tied to natural forces and cities. Their architectural achievements included ziggurats (stepped temples)."
                },
                explanation: `
                    <ul>
                        <li><strong>Similarity:</strong> Both texts describe major <strong>ancient river valley civilizations</strong> (Egypt and Mesopotamia) known for agriculture, writing systems, religion, and significant innovations.</li>
                        <li><strong>Difference:</strong> Text A focuses on <strong>Egypt</strong> (<code>Nile</code>, <code>pyramids</code>, <code>pharaohs</code>, <code>hieroglyphs</code>, predictable floods). Text B focuses on <strong>Mesopotamia</strong> (<code>Tigris & Euphrates</code>, <code>city-states</code>, <code>cuneiform</code>, <code>ziggurats</code>, Code of Hammurabi, less predictable floods). A key difference highlighted is Egypt's political unity versus Mesopotamia's city-states.</li>
                        <li><strong>Signal Words:</strong> Text B uses <code>Meanwhile</code> to introduce Mesopotamia as a separate but concurrent civilization. <code>Unlike</code> is used to contrast the political structures.</li>
                    </ul>`,
                quiz: {
                    question: "A major difference highlighted between Ancient Egypt and Mesopotamia is:",
                    options: [
                        "Egyptians used writing, Mesopotamians did not.",
                        "Mesopotamians built pyramids, Egyptians built ziggurats.",
                        "Egypt was generally unified, Mesopotamia consisted of city-states.",
                        "Mesopotamia relied on river flooding, Egypt did not."
                    ],
                    correctAnswerIndex: 2 // C
                }
            },
            { // Ex 4: Nutrition Science - MORE REDACTIONS
                textA: {
                    redacted: "<strong>Macronutrients</strong> are the <code>&nbsp;&nbsp;&nbsp;</code> the body needs in <code>&nbsp;&nbsp;&nbsp;</code> large amounts: <strong>carbohydrates</strong>, <strong>proteins</strong>, and <strong>fats</strong>. <strong>Carbohydrates</strong> are the <code>&nbsp;&nbsp;&nbsp;</code> source of <code>&nbsp;&nbsp;&nbsp;</code>. <strong>Proteins</strong> are <code>&nbsp;&nbsp;&nbsp;</code> for <code>&nbsp;&nbsp;&nbsp;</code> and repairing tissues, <code>&nbsp;&nbsp;&nbsp;</code> muscle, and for making <code>&nbsp;&nbsp;&nbsp;</code> and hormones. <strong>Fats</strong> <code>&nbsp;&nbsp;&nbsp;</code> energy, support cell growth, <code>&nbsp;&nbsp;&nbsp;</code> organs, and help absorb <code>&nbsp;&nbsp;&nbsp;</code> vitamins.<br><br><code>&nbsp;&nbsp;&nbsp;</code> these macronutrients is <code>&nbsp;&nbsp;&nbsp;</code> for overall health. The specific <code>&nbsp;&nbsp;&nbsp;</code> needed can <code>&nbsp;&nbsp;&nbsp;</code> based on age, activity level, and health <code>&nbsp;&nbsp;&nbsp;</code>, but all three are <code>&nbsp;&nbsp;&nbsp;</code> required for <code>&nbsp;&nbsp;&nbsp;</code> and proper bodily function.",
                    full: "Macronutrients are the nutrients the body needs in relatively large amounts: carbohydrates, proteins, and fats. Carbohydrates are the primary source of energy. Proteins are essential for building and repairing tissues, like muscle, and for making enzymes and hormones. Fats provide energy, support cell growth, protect organs, and help absorb certain vitamins.\n\nBalancing these macronutrients is crucial for overall health. The specific ratio needed can vary based on age, activity level, and health goals, but all three are fundamentally required for survival and proper bodily function."
                },
                textB: {
                    redacted: "<strong>Micronutrients</strong>, <code>&nbsp;&nbsp;&nbsp;</code>, are needed in much smaller amounts but are <code>&nbsp;&nbsp;&nbsp;</code> vital. These include <strong>vitamins</strong> (<code>&nbsp;&nbsp;&nbsp;</code> Vitamin C, Vitamin D, B vitamins) and <strong>minerals</strong> (<code>&nbsp;&nbsp;&nbsp;</code> calcium, iron, <code>&nbsp;&nbsp;&nbsp;</code>). They don't <code>&nbsp;&nbsp;&nbsp;</code> energy <code>&nbsp;&nbsp;&nbsp;</code> but play critical roles in <code>&nbsp;&nbsp;&nbsp;</code> bodily processes.<br><br><code>&nbsp;&nbsp;&nbsp;</code>, Vitamin C is <code>&nbsp;&nbsp;&nbsp;</code> for immune function and <code>&nbsp;&nbsp;&nbsp;</code> synthesis, while iron is <code>&nbsp;&nbsp;&nbsp;</code> for oxygen transport in the <code>&nbsp;&nbsp;&nbsp;</code>. <code>&nbsp;&nbsp;&nbsp;</code> in micronutrients can <code>&nbsp;&nbsp;&nbsp;</code> to various health problems, <code>&nbsp;&nbsp;&nbsp;</code> if macronutrient intake is adequate. A <code>&nbsp;&nbsp;&nbsp;</code> diet rich in fruits, <code>&nbsp;&nbsp;&nbsp;</code>, and whole foods is <code>&nbsp;&nbsp;&nbsp;</code> the best way to <code>&nbsp;&nbsp;&nbsp;</code> sufficient micronutrient intake.",
                    full: "Micronutrients, conversely, are needed in much smaller amounts but are equally vital. These include vitamins (like Vitamin C, Vitamin D, B vitamins) and minerals (like calcium, iron, zinc). They don't provide energy directly but play critical roles in numerous bodily processes.\n\nFor example, Vitamin C is crucial for immune function and collagen synthesis, while iron is necessary for oxygen transport in the blood. Deficiencies in micronutrients can lead to various health problems, even if macronutrient intake is adequate. A varied diet rich in fruits, vegetables, and whole foods is typically the best way to ensure sufficient micronutrient intake."
                },
                explanation: `
                    <ul>
                        <li><strong>Similarity:</strong> Both texts discuss essential categories of <strong>nutrients</strong> required for human health (<strong>macronutrients</strong> and <strong>micronutrients</strong>).</li>
                        <li><strong>Difference:</strong> Text A focuses on <strong>macronutrients</strong> (<code>carbohydrates</code>, <code>proteins</code>, <code>fats</code>), needed in <code>large amounts</code>, primarily for <code>energy</code> and building tissues. Text B focuses on <strong>micronutrients</strong> (<code>vitamins</code>, <code>minerals</code>), needed in <code>smaller amounts</code>, crucial for regulating bodily <code>processes</code> rather than providing energy directly.</li>
                        <li><strong>Signal Words:</strong> Text B uses <code>conversely</code> to highlight the contrast in quantity needed compared to macronutrients. <code>For example</code> is used to illustrate the roles of specific micronutrients.</li>
                    </ul>`,
                quiz: {
                    question: "What is the main difference between macronutrients and micronutrients described in the texts?",
                    options: [
                        "Macronutrients are vitamins/minerals, micronutrients are carbs/protein/fat.",
                        "Micronutrients build tissues, macronutrients regulate processes.",
                        "The body needs large amounts of macronutrients and small amounts of micronutrients.",
                        "Macronutrients are less vital than micronutrients."

                    ],
                    correctAnswerIndex: 2 // C
                }
            },
            { // Ex 5: Global Trade - MORE REDACTIONS
                textA: {
                    redacted: "<strong>Free trade</strong> agreements <code>&nbsp;&nbsp;&nbsp;</code> to <code>&nbsp;&nbsp;&nbsp;</code> barriers to international <code>&nbsp;&nbsp;&nbsp;</code>, such as <strong>tariffs</strong> (taxes on imports) and <strong>quotas</strong> (<code>&nbsp;&nbsp;&nbsp;</code> on import quantities). Proponents argue this <code>&nbsp;&nbsp;&nbsp;</code> to <code>&nbsp;&nbsp;&nbsp;</code> efficiency, lower prices for <code>&nbsp;&nbsp;&nbsp;</code>, and increased economic growth as countries <code>&nbsp;&nbsp;&nbsp;</code> in producing goods and services where they have a comparative <code>&nbsp;&nbsp;&nbsp;</code>.<br><br><code>&nbsp;&nbsp;&nbsp;</code> competition can also <code>&nbsp;&nbsp;&nbsp;</code> innovation and improve product quality. The ideal of <strong>free trade</strong> is a global marketplace with <code>&nbsp;&nbsp;&nbsp;</code> government interference, allowing market forces to determine <code>&nbsp;&nbsp;&nbsp;</code> and production levels.",
                    full: "Free trade agreements aim to reduce barriers to international commerce, such as tariffs (taxes on imports) and quotas (limits on import quantities). Proponents argue this leads to greater efficiency, lower prices for consumers, and increased economic growth as countries specialize in producing goods and services where they have a comparative advantage.\n\nIncreased competition can also spur innovation and improve product quality. The ideal of free trade is a global marketplace with minimal government interference, allowing market forces to determine prices and production levels."
                },
                textB: {
                    redacted: "<code>&nbsp;&nbsp;&nbsp;</code>, <strong>protectionism</strong> involves policies <code>&nbsp;&nbsp;&nbsp;</code> to shield domestic industries from foreign competition. This can be <code>&nbsp;&nbsp;&nbsp;</code> through <strong>tariffs</strong>, <strong>quotas</strong>, subsidies for local producers, or other <code>&nbsp;&nbsp;&nbsp;</code> that make imported goods more <code>&nbsp;&nbsp;&nbsp;</code> or harder to obtain. Advocates argue <strong>protectionism</strong> is <code>&nbsp;&nbsp;&nbsp;</code> to safeguard domestic jobs, protect emerging <code>&nbsp;&nbsp;&nbsp;</code>, and ensure national security in critical sectors.<br><br><code>&nbsp;&nbsp;&nbsp;</code>, critics contend that protectionist measures often <code>&nbsp;&nbsp;&nbsp;</code> to higher prices for consumers, <code>&nbsp;&nbsp;&nbsp;</code> choice, and potential retaliation from other countries (trade wars), ultimately <code>&nbsp;&nbsp;&nbsp;</code> overall economic welfare.",
                    full: "Conversely, protectionism involves policies designed to shield domestic industries from foreign competition. This can be done through tariffs, quotas, subsidies for local producers, or other regulations that make imported goods more expensive or harder to obtain. Advocates argue protectionism is necessary to safeguard domestic jobs, protect emerging industries, and ensure national security in critical sectors.\n\nHowever, critics contend that protectionist measures often lead to higher prices for consumers, reduced choice, and potential retaliation from other countries (trade wars), ultimately harming overall economic welfare."
                },
                explanation: `
                    <ul>
                        <li><strong>Similarity:</strong> Both texts discuss approaches to <strong>international trade</strong> policy and how governments regulate commerce across borders.</li>
                        <li><strong>Difference:</strong> They describe opposite philosophies. Text A explains <strong>free trade</strong>, which aims to <code>reduce</code> barriers (like <code>tariffs</code>) to promote efficiency and lower prices. Text B explains <strong>protectionism</strong>, which uses barriers (like <code>tariffs</code>, <code>quotas</code>, <code>subsidies</code>) to <code>shield</code> domestic industries and jobs from competition.</li>
                        <li><strong>Signal Words:</strong> Text B uses <code>Conversely</code> to signal the opposing approach of protectionism. It also uses <code>However</code> to introduce the criticisms of protectionism.</li>
                    </ul>`,
                quiz: {
                    question: "What tool is used by BOTH free trade opponents (protectionists) AND sometimes reduced by free trade proponents?",
                    options: [
                        "Subsidies for local producers",
                        "Tariffs on imported goods",
                        "Increased government interference",
                        "Comparative advantage"
                    ],
                    correctAnswerIndex: 1 // B
                }
            },
            { // Ex 6: Film Theory - MORE REDACTIONS
                 textA: {
                    redacted: "<strong>Auteur theory</strong> is a <code>&nbsp;&nbsp;&nbsp;</code> approach that <code>&nbsp;&nbsp;&nbsp;</code> the <strong>director</strong> as the <code>&nbsp;&nbsp;&nbsp;</code> author or 'auteur' of a film. This theory <code>&nbsp;&nbsp;&nbsp;</code> the director's personal creative vision, <code>&nbsp;&nbsp;&nbsp;</code> signatures, and recurring themes <code>&nbsp;&nbsp;&nbsp;</code> their body of work. <code>&nbsp;&nbsp;&nbsp;</code>, films are analyzed not just as individual <code>&nbsp;&nbsp;&nbsp;</code> but as expressions of the director's unique artistic voice, much like the <code>&nbsp;&nbsp;&nbsp;</code> of a novelist or painter.<br><br><code>&nbsp;&nbsp;&nbsp;</code> focus on directors like Alfred Hitchcock or <code>&nbsp;&nbsp;&nbsp;</code> Kubrick, whose distinct <code>&nbsp;&nbsp;&nbsp;</code> and thematic preoccupations are <code>&nbsp;&nbsp;&nbsp;</code> across their filmographies. The theory <code>&nbsp;&nbsp;&nbsp;</code> the <strong>director</strong> above other collaborators like <code>&nbsp;&nbsp;&nbsp;</code> or producers in <code>&nbsp;&nbsp;&nbsp;</code> the film's ultimate meaning and artistry.",
                    full: "Auteur theory is a film criticism approach that views the director as the primary author or 'auteur' of a film. This theory emphasizes the director's personal creative vision, stylistic signatures, and recurring themes across their body of work. Consequently, films are analyzed not just as individual stories but as expressions of the director's unique artistic voice, much like the works of a novelist or painter.\n\nExamples focus on directors like Alfred Hitchcock or Stanley Kubrick, whose distinct styles and thematic preoccupations are evident across their filmographies. The theory elevates the director above other collaborators like writers or producers in determining the film's ultimate meaning and artistry."
                },
                textB: {
                    redacted: "<code>&nbsp;&nbsp;&nbsp;</code> to auteur theory, some <code>&nbsp;&nbsp;&nbsp;</code> argue that <strong>filmmaking</strong> is an inherently <strong>collaborative</strong> art form. They <code>&nbsp;&nbsp;&nbsp;</code> that attributing authorship <code>&nbsp;&nbsp;&nbsp;</code> to the <strong>director</strong> overlooks the crucial <code>&nbsp;&nbsp;&nbsp;</code> of screenwriters, cinematographers, <code>&nbsp;&nbsp;&nbsp;</code>, actors, <code>&nbsp;&nbsp;&nbsp;</code> designers, and composers. Each of these <code>&nbsp;&nbsp;&nbsp;</code> significantly <code>&nbsp;&nbsp;&nbsp;</code> the final film.<br><br>This <strong>collaborative</strong> perspective <code>&nbsp;&nbsp;&nbsp;</code> that meaning and artistry emerge from the complex <code>&nbsp;&nbsp;&nbsp;</code> of various creative inputs, rather than <code>&nbsp;&nbsp;&nbsp;</code> from a single <code>&nbsp;&nbsp;&nbsp;</code>. <code>&nbsp;&nbsp;&nbsp;</code>, analyzing a film requires <code>&nbsp;&nbsp;&nbsp;</code> the contributions of the entire creative team and the <code>&nbsp;&nbsp;&nbsp;</code> context of its production, not just the director's perceived intentions or style.",
                    full: "Counter to auteur theory, some critics argue that filmmaking is an inherently collaborative art form. They contend that attributing authorship solely to the director overlooks the crucial contributions of screenwriters, cinematographers, editors, actors, production designers, and composers. Each of these roles significantly shapes the final film.\n\nThis collaborative perspective suggests that meaning and artistry emerge from the complex interplay of various creative inputs, rather than originating from a single visionary. Therefore, analyzing a film requires considering the contributions of the entire creative team and the industrial context of its production, not just the director's perceived intentions or style."
                },
                explanation: `
                    <ul>
                        <li><strong>Similarity:</strong> Both texts discuss theories of authorship and creative control within <strong>filmmaking</strong>.</li>
                        <li><strong>Difference:</strong> They present conflicting views on who the primary 'author' of a film is. Text A explains <strong>auteur theory</strong>, which emphasizes the <strong>director</strong> as the central creative force and 'author'. Text B presents a counter-argument, emphasizing filmmaking as a <strong>collaborative</strong> process where many individuals (<code>screenwriters</code>, <code>cinematographers</code>, etc.) contribute significantly to the final product.</li>
                        <li><strong>Signal Words:</strong> Text A uses <code>Consequently</code> to link the director's vision to the analysis method. Text B uses <code>Counter to</code> to explicitly oppose auteur theory and <code>Therefore</code> to conclude the implication of the collaborative view.</li>
                    </ul>`,
                quiz: {
                    question: "Auteur theory, described in Text A, primarily focuses on the importance of the:",
                    options: [
                        "Screenwriter",
                        "Producer",
                        "Lead Actor",
                        "Director"
                    ],
                    correctAnswerIndex: 3 // D
                }
            },
             { // Ex 7: Music History - MORE REDACTIONS
                textA: {
                    redacted: "The <strong>Baroque</strong> period in Western music (<code>&nbsp;&nbsp;&nbsp;</code> 1600-1750) is <code>&nbsp;&nbsp;&nbsp;</code> by ornate detail, <code>&nbsp;&nbsp;&nbsp;</code>, and emotional intensity. Composers like Bach, Handel, and Vivaldi <code>&nbsp;&nbsp;&nbsp;</code> complex <strong>counterpoint</strong> (multiple <code>&nbsp;&nbsp;&nbsp;</code> melodic lines woven together), elaborate <code>&nbsp;&nbsp;&nbsp;</code>, and often a strong, driving rhythm. <code>&nbsp;&nbsp;&nbsp;</code> contrast between loud and soft dynamics (<strong>terraced dynamics</strong>) was <code>&nbsp;&nbsp;&nbsp;</code>.<br><br>Forms like the concerto grosso, <code>&nbsp;&nbsp;&nbsp;</code>, and opera seria flourished during this era. Music often served <code>&nbsp;&nbsp;&nbsp;</code> purposes, whether for the church, royal courts, or public opera houses, reflecting the <code>&nbsp;&nbsp;&nbsp;</code> social order of the time.",
                    full: "The Baroque period in Western music (roughly 1600-1750) is characterized by ornate detail, grandeur, and emotional intensity. Composers like Bach, Handel, and Vivaldi utilized complex counterpoint (multiple independent melodic lines woven together), elaborate ornamentation, and often a strong, driving rhythm. Sharp contrast between loud and soft dynamics (terraced dynamics) was common.\n\nForms like the concerto grosso, fugue, and opera seria flourished during this era. Music often served functional purposes, whether for the church, royal courts, or public opera houses, reflecting the structured social order of the time."
                },
                textB: {
                    redacted: "<code>&nbsp;&nbsp;&nbsp;</code>, the <strong>Classical</strong> period (roughly 1750-1820) <code>&nbsp;&nbsp;&nbsp;</code> against Baroque complexity, favoring clarity, <code>&nbsp;&nbsp;&nbsp;</code>, and elegance. Composers like Mozart, Haydn, and early Beethoven emphasized clearer melodies, <code>&nbsp;&nbsp;&nbsp;</code> harmonies, and more <code>&nbsp;&nbsp;&nbsp;</code> phrasing. <strong>Gradual</strong> changes in dynamics (<code>&nbsp;&nbsp;&nbsp;</code> and diminuendo) <code>&nbsp;&nbsp;&nbsp;</code> the abrupt shifts of the Baroque.<br><br>The symphony, <code>&nbsp;&nbsp;&nbsp;</code> quartet, and sonata form became dominant. While still <code>&nbsp;&nbsp;&nbsp;</code> by aristocracy, music increasingly catered to a growing middle-class audience through public concerts. The emphasis shifted towards order, <code>&nbsp;&nbsp;&nbsp;</code>, and a more 'natural' expression <code>&nbsp;&nbsp;&nbsp;</code> to Baroque <code>&nbsp;&nbsp;&nbsp;</code>.",
                    full: "Subsequently, the Classical period (roughly 1750-1820) reacted against Baroque complexity, favoring clarity, balance, and elegance. Composers like Mozart, Haydn, and early Beethoven emphasized clearer melodies, simpler harmonies, and more graceful phrasing. Gradual changes in dynamics (crescendo and diminuendo) replaced the abrupt shifts of the Baroque.\n\nThe symphony, string quartet, and sonata form became dominant. While still patronized by aristocracy, music increasingly catered to a growing middle-class audience through public concerts. The emphasis shifted towards order, reason, and a more 'natural' expression compared to Baroque extravagance."
                },
                explanation: `
                    <ul>
                        <li><strong>Similarity:</strong> Both texts describe major periods in Western classical <strong>music history</strong>, naming key composers and common musical forms.</li>
                        <li><strong>Difference:</strong> They contrast the stylistic characteristics. Text A describes the <strong>Baroque</strong> period as <code>ornate</code>, <code>complex</code> (counterpoint), with <code>abrupt</code> dynamic shifts (<code>terraced dynamics</code>). Text B describes the <strong>Classical</strong> period as favoring <code>clarity</code>, <code>balance</code>, <code>simpler</code> harmonies, and <code>gradual</code> dynamic changes, explicitly stating it <code>reacted against</code> Baroque complexity.</li>
                        <li><strong>Signal Words:</strong> Text B uses <code>Subsequently</code> to indicate the chronological progression and explicitly mentions the Classical period <code>reacted against</code> the Baroque style.</li>
                    </ul>`,
                quiz: {
                    question: "How did the Classical period differ from the Baroque period in its approach to musical complexity?",
                    options: [
                        "Classical music used more complex counterpoint.",
                        "Classical music favored clarity and balance over Baroque ornateness.",
                        "Baroque music used gradual dynamics, Classical used abrupt shifts.",
                        "Baroque music was simpler and more elegant."
                    ],
                    correctAnswerIndex: 1 // B
                }
            },
            { // Ex 8: Cognitive Bias - MORE REDACTIONS
                textA: {
                    redacted: "<strong>Confirmation bias</strong> is the <code>&nbsp;&nbsp;&nbsp;</code> to search for, interpret, <code>&nbsp;&nbsp;&nbsp;</code>, and recall information <code>&nbsp;&nbsp;&nbsp;</code> a way that <code>&nbsp;&nbsp;&nbsp;</code> one's <strong>preexisting beliefs</strong> or hypotheses. People <code>&nbsp;&nbsp;&nbsp;</code> this bias when they gather evidence <code>&nbsp;&nbsp;&nbsp;</code> or interpret <code>&nbsp;&nbsp;&nbsp;</code> evidence as supporting their existing <code>&nbsp;&nbsp;&nbsp;</code>. <code>&nbsp;&nbsp;&nbsp;</code>, someone who believes a certain political theory might only <code>&nbsp;&nbsp;&nbsp;</code> news from sources that <code>&nbsp;&nbsp;&nbsp;</code> that theory, <code>&nbsp;&nbsp;&nbsp;</code> contradictory information.<br><br>This bias affects <code>&nbsp;&nbsp;&nbsp;</code> by leading individuals to overweight confirming evidence and <code>&nbsp;&nbsp;&nbsp;</code> disconfirming evidence, <code>&nbsp;&nbsp;&nbsp;</code> in strengthened, potentially <code>&nbsp;&nbsp;&nbsp;</code> beliefs.",
                    full: "Confirmation bias is the tendency to search for, interpret, favor, and recall information in a way that confirms one's preexisting beliefs or hypotheses. People display this bias when they gather evidence selectively or interpret ambiguous evidence as supporting their existing position. For example, someone who believes a certain political theory might only consume news from sources that support that theory, dismissing contradictory information.\n\nThis bias affects decision-making by leading individuals to overweight confirming evidence and underweight disconfirming evidence, resulting in strengthened, potentially inaccurate beliefs."
                },
                textB: {
                    redacted: "The <strong>availability heuristic</strong>, <code>&nbsp;&nbsp;&nbsp;</code>, is a mental shortcut that <code>&nbsp;&nbsp;&nbsp;</code> on immediate examples that come to a <code>&nbsp;&nbsp;&nbsp;</code> person's <strong>mind</strong> when evaluating a specific topic, <code>&nbsp;&nbsp;&nbsp;</code>, method or decision. If something can be recalled <code>&nbsp;&nbsp;&nbsp;</code> (it is highly 'available' in memory), it is <code>&nbsp;&nbsp;&nbsp;</code> to be more probable or <code>&nbsp;&nbsp;&nbsp;</code> than something less easily recalled. <code>&nbsp;&nbsp;&nbsp;</code>, after seeing several news reports about plane crashes, someone might <code>&nbsp;&nbsp;&nbsp;</code> flying as more dangerous than driving, <code>&nbsp;&nbsp;&nbsp;</code> though statistically driving is far riskier.<br><br>This occurs because dramatic or <code>&nbsp;&nbsp;&nbsp;</code> events are more easily <code>&nbsp;&nbsp;&nbsp;</code> from <strong>memory</strong>, leading to an <code>&nbsp;&nbsp;&nbsp;</code> of their likelihood compared to less <code>&nbsp;&nbsp;&nbsp;</code> but potentially more common occurrences.",
                    full: "The availability heuristic, meanwhile, is a mental shortcut that relies on immediate examples that come to a given person's mind when evaluating a specific topic, concept, method or decision. If something can be recalled easily (it is highly 'available' in memory), it is judged to be more probable or frequent than something less easily recalled. For instance, after seeing several news reports about plane crashes, someone might judge flying as more dangerous than driving, even though statistically driving is far riskier.\n\nThis occurs because dramatic or recent events are more easily retrieved from memory, leading to an overestimation of their likelihood compared to less vivid but potentially more common occurrences."
                },
                explanation: `
                    <ul>
                        <li><strong>Similarity:</strong> Both texts describe common <strong>cognitive biases</strong> or mental shortcuts that can lead to flawed judgments or decision-making.</li>
                        <li><strong>Difference:</strong> They describe different mechanisms. Text A explains <strong>confirmation bias</strong>, which is about favoring information that supports <code>existing beliefs</code>. Text B explains the <strong>availability heuristic</strong>, which is about judging likelihood based on how easily examples come to <code>mind</code> (<code>recall</code>/<code>memory</code>), often influenced by recent or vivid events.</li>
                        <li><strong>Signal Words:</strong> Text A uses <code>For example</code>. Text B uses <code>meanwhile</code> to introduce a different bias and <code>For instance</code> to provide an example.</li>
                    </ul>`,
                quiz: {
                    question: "According to the texts, what primarily influences judgments made via the 'Availability Heuristic'?",
                    options: [
                        "Preexisting personal beliefs",
                        "The ease with which examples come to mind",
                        "Statistical probability",
                        "Information from trusted sources"
                    ],
                    correctAnswerIndex: 1 // B
                }
            },
            { // Ex 9: Astrophysics - MORE REDACTIONS
                textA: {
                    redacted: "A <strong>neutron star</strong> is the incredibly <code>&nbsp;&nbsp;&nbsp;</code> remnant core of a <strong>massive star</strong> that has <code>&nbsp;&nbsp;&nbsp;</code> a supernova explosion. Composed almost <code>&nbsp;&nbsp;&nbsp;</code> of <code>&nbsp;&nbsp;&nbsp;</code> packed tightly together, a teaspoonful of neutron star material would <code>&nbsp;&nbsp;&nbsp;</code> billions of tons on Earth. They are <code>&nbsp;&nbsp;&nbsp;</code> only about 10-20 kilometers in diameter but <code>&nbsp;&nbsp;&nbsp;</code> more <code>&nbsp;&nbsp;&nbsp;</code> than our Sun.<br><br>Many neutron stars <code>&nbsp;&nbsp;&nbsp;</code> rapidly, emitting beams of radiation that <code>&nbsp;&nbsp;&nbsp;</code> across space like a <code>&nbsp;&nbsp;&nbsp;</code> beam. If these beams <code>&nbsp;&nbsp;&nbsp;</code> to point towards Earth periodically, we <code>&nbsp;&nbsp;&nbsp;</code> them as <strong>pulsars</strong>.",
                    full: "A neutron star is the incredibly dense remnant core of a massive star that has undergone a supernova explosion. Composed almost entirely of neutrons packed tightly together, a teaspoonful of neutron star material would weigh billions of tons on Earth. They are typically only about 10-20 kilometers in diameter but contain more mass than our Sun.\n\nMany neutron stars rotate rapidly, emitting beams of radiation that sweep across space like a lighthouse beam. If these beams happen to point towards Earth periodically, we observe them as pulsars."
                },
                textB: {
                    redacted: "A <strong>black hole</strong>, <code>&nbsp;&nbsp;&nbsp;</code>, forms when an even more <strong>massive star</strong> collapses under its own gravity at the <code>&nbsp;&nbsp;&nbsp;</code> of its life, or potentially through other <code>&nbsp;&nbsp;&nbsp;</code>. It represents a region of spacetime where <code>&nbsp;&nbsp;&nbsp;</code> is so strong that nothing, not even <strong>light</strong>, can <code>&nbsp;&nbsp;&nbsp;</code> once it crosses the <strong>event horizon</strong>. <code>&nbsp;&nbsp;&nbsp;</code> neutron stars which have a physical surface, a black hole is <code>&nbsp;&nbsp;&nbsp;</code> by this boundary of no return.<br><br>While black holes themselves are <code>&nbsp;&nbsp;&nbsp;</code>, their presence can be <code>&nbsp;&nbsp;&nbsp;</code> by their gravitational effects on nearby stars and gas clouds, or <code>&nbsp;&nbsp;&nbsp;</code> the detection of high-energy radiation emitted as matter <code>&nbsp;&nbsp;&nbsp;</code> into them.",
                    full: "A black hole, conversely, forms when an even more massive star collapses under its own gravity at the end of its life, or potentially through other processes. It represents a region of spacetime where gravity is so strong that nothing, not even light, can escape once it crosses the event horizon. Unlike neutron stars which have a physical surface, a black hole is defined by this boundary of no return.\n\nWhile black holes themselves are invisible, their presence can be inferred by their gravitational effects on nearby stars and gas clouds, or through the detection of high-energy radiation emitted as matter falls into them."
                },
                explanation: `
                    <ul>
                        <li><strong>Similarity:</strong> Both texts describe extremely dense astronomical objects (<strong>neutron stars</strong> and <strong>black holes</strong>) that form from the collapse of <strong>massive stars</strong>.</li>
                        <li><strong>Difference:</strong> Text A describes <strong>neutron stars</strong> as dense physical objects made of <code>neutrons</code> with immense mass in a small diameter, sometimes observed as <code>pulsars</code>. Text B describes <strong>black holes</strong> as regions of spacetime with gravity so strong <code>light cannot escape</code>, defined by an <code>event horizon</code> rather than a physical surface. It also mentions they form from *even more* massive stars than neutron stars.</li>
                        <li><strong>Signal Words:</strong> Text B uses <code>conversely</code> and <code>Unlike neutron stars</code> to highlight the differences.</li>
                    </ul>`,
                quiz: {
                    question: "What key characteristic distinguishes a black hole from a neutron star, according to the texts?",
                    options: [
                        "Neutron stars rotate, black holes do not.",
                        "Black holes emit beams of radiation (pulsars).",
                        "Neutron stars are larger in diameter.",
                        "Black holes have an event horizon from which light cannot escape."
                    ],
                    correctAnswerIndex: 3 // D
                }
            },
            { // Ex 10: Digital Privacy - MORE REDACTIONS
                textA: {
                    redacted: "<strong>Data encryption</strong> is a fundamental technique for <code>&nbsp;&nbsp;&nbsp;</code> digital information. It <code>&nbsp;&nbsp;&nbsp;</code> converting plaintext data into <code>&nbsp;&nbsp;&nbsp;</code> using an algorithm and a key. Only someone <code>&nbsp;&nbsp;&nbsp;</code> the correct <code>&nbsp;&nbsp;&nbsp;</code> can decrypt the ciphertext back into readable plaintext. This process ensures <strong>confidentiality</strong>, <code>&nbsp;&nbsp;&nbsp;</code> that even if the encrypted data is intercepted, it remains <code>&nbsp;&nbsp;&nbsp;</code> to unauthorized parties.<br><br><strong>End-to-end encryption</strong>, used in many messaging apps, <code>&nbsp;&nbsp;&nbsp;</code> that only the sender and intended recipient can read the <code>&nbsp;&nbsp;&nbsp;</code>, not even the service provider.",
                    full: "Data encryption is a fundamental technique for protecting digital information. It involves converting plaintext data into ciphertext using an algorithm and a key. Only someone possessing the correct key can decrypt the ciphertext back into readable plaintext. This process ensures confidentiality, meaning that even if the encrypted data is intercepted, it remains unintelligible to unauthorized parties.\n\nEnd-to-end encryption, used in many messaging apps, ensures that only the sender and intended recipient can read the messages, not even the service provider."
                },
                textB: {
                    redacted: "<strong>Data anonymization</strong>, <code>&nbsp;&nbsp;&nbsp;</code>, focuses on removing or altering personally identifiable information (<code>&nbsp;&nbsp;&nbsp;</code>) from datasets so that the individuals <code>&nbsp;&nbsp;&nbsp;</code> cannot be reasonably identified. Techniques include removing direct identifiers like names and addresses, generalizing information (e.g., replacing <code>&nbsp;&nbsp;&nbsp;</code> age with an age range), or adding statistical <code>&nbsp;&nbsp;&nbsp;</code>.<br><br><code>&nbsp;&nbsp;&nbsp;</code> encryption protects the content itself, anonymization aims to protect <strong>identity</strong> while still allowing the data to be used for <code>&nbsp;&nbsp;&nbsp;</code> or research. <code>&nbsp;&nbsp;&nbsp;</code>, achieving perfect anonymization is <code>&nbsp;&nbsp;&nbsp;</code>, as combining anonymized datasets can sometimes lead to re-identification.",
                    full: "Data anonymization, on the other hand, focuses on removing or altering personally identifiable information (PII) from datasets so that the individuals described cannot be reasonably identified. Techniques include removing direct identifiers like names and addresses, generalizing information (e.g., replacing exact age with an age range), or adding statistical noise.\n\nWhile encryption protects the content itself, anonymization aims to protect identity while still allowing the data to be used for analysis or research. However, achieving perfect anonymization is challenging, as combining anonymized datasets can sometimes lead to re-identification."
                },
                explanation: `
                    <ul>
                        <li><strong>Similarity:</strong> Both texts describe techniques used to enhance <strong>digital privacy</strong> and protect sensitive information.</li>
                        <li><strong>Difference:</strong> They address different aspects of privacy. Text A explains <strong>data encryption</strong>, which focuses on making the <code>content</code> of data unreadable (<code>confidentiality</code>) without the correct key. Text B explains <strong>data anonymization</strong>, which focuses on removing or altering information to protect the <code>identity</code> of individuals within a dataset, while potentially leaving the data usable for analysis.</li>
                        <li><strong>Signal Words:</strong> Text B uses <code>on the other hand</code> and <code>While encryption protects...</code> to contrast anonymization with encryption. It also uses <code>However</code> to introduce a limitation of anonymization.</li>
                    </ul>`,
                quiz: {
                    question: "What is the primary goal of 'Data Anonymization' as described in Text B?",
                    options: [
                        "To make data completely unreadable without a key.",
                        "To protect the identity of individuals in a dataset.",
                        "To ensure only the sender and receiver can see messages.",
                        "To add statistical noise to improve data quality."
                    ],
                    correctAnswerIndex: 1 // B
                }
            }
        ];


        let isRevealed = false;
        let currentExampleIndex = 0;
        let quizSubmitted = false;

        const revealBtn = document.getElementById('reveal-btn');
        const attemptBtn = document.getElementById('attempt-btn');
        const textAContent = document.getElementById('text-a-content');
        const textBContent = document.getElementById('text-b-content');
        const exampleSelect = document.getElementById('example-select');
        const explanationContainer = document.getElementById('explanation-container');
        const explanationContent = document.getElementById('explanation-content');
        const quizContainer = document.getElementById('quiz-container');
        const quizQuestion = document.getElementById('quiz-question');
        const quizOptions = document.getElementById('quiz-options');
        const submitQuizBtn = document.getElementById('submit-quiz-btn');
        const quizFeedback = document.getElementById('quiz-feedback');

        const tabAnalyzer = document.getElementById('tab-analyzer');
        const tabDetective = document.getElementById('tab-detective');
        const analyzerContainer = document.getElementById('analyzer-container');
        const detectiveContainer = document.getElementById('detective-container');


        function renderText(index) {
            currentExampleIndex = parseInt(index);
            isRevealed = false;
            quizSubmitted = false;

            textAContent.innerHTML = textPairs[currentExampleIndex].textA.redacted;
            textBContent.innerHTML = textPairs[currentExampleIndex].textB.redacted;

            revealBtn.textContent = 'Show Full Text';
            revealBtn.classList.add('hidden');
            attemptBtn.classList.add('hidden');

            explanationContainer.classList.add('hidden');
            explanationContent.innerHTML = '';

            populateQuiz(currentExampleIndex);
            quizContainer.classList.remove('hidden');
            submitQuizBtn.disabled = true;
            submitQuizBtn.classList.remove('hidden');
            quizFeedback.classList.add('hidden');
            quizFeedback.textContent = '';
            quizOptions.querySelectorAll('input').forEach(input => input.disabled = false);
        }

        function populateQuiz(index) {
            const quizData = textPairs[index].quiz;
            quizQuestion.textContent = quizData.question;
            quizOptions.innerHTML = '';

            quizData.options.forEach((option, i) => {
                const optionId = `option-${i}`;
                const div = document.createElement('div');
                div.className = 'quiz-option';
                div.innerHTML = `
                    <input type="radio" name="quizAnswer" id="${optionId}" value="${i}" class="sr-only">
                    <label for="${optionId}">${option}</label>
                `;
                const radioInput = div.querySelector(`#${optionId}`);
                radioInput.addEventListener('change', () => {
                    submitQuizBtn.disabled = false;
                });
                quizOptions.appendChild(div);
            });
        }

        function handleQuizSubmit() {
            const selectedOption = quizOptions.querySelector('input[name="quizAnswer"]:checked');
            if (!selectedOption) return;

            const selectedIndex = parseInt(selectedOption.value);
            const correctIndex = textPairs[currentExampleIndex].quiz.correctAnswerIndex;

            quizFeedback.classList.remove('hidden');
            if (selectedIndex === correctIndex) {
                quizFeedback.textContent = 'Correct!';
                quizFeedback.className = 'feedback-correct';
            } else {
                quizFeedback.textContent = `Incorrect. The correct answer was: "${textPairs[currentExampleIndex].quiz.options[correctIndex]}"`;
                quizFeedback.className = 'feedback-incorrect';
            }
            quizFeedback.classList.add('p-3', 'rounded-lg', 'mt-4', 'font-medium', 'text-center');

            submitQuizBtn.disabled = true;
            submitQuizBtn.classList.add('hidden');
            quizOptions.querySelectorAll('input').forEach(input => input.disabled = true);

            setTimeout(() => {
                quizFeedback.classList.add('hidden');
                attemptBtn.classList.remove('hidden');
            }, 1500);

            quizSubmitted = true;
        }

        function toggleReveal() {
            isRevealed = !isRevealed;
            const currentPair = textPairs[currentExampleIndex];

            if (isRevealed) {
                textAContent.innerHTML = currentPair.textA.full.replace(/\n\n/g, '<br><br>').replace(/\n/g, '<br>');
                textBContent.innerHTML = currentPair.textB.full.replace(/\n\n/g, '<br><br>').replace(/\n/g, '<br>');
                revealBtn.textContent = 'Hide Full Text';

                explanationContent.innerHTML = currentPair.explanation;
                explanationContainer.classList.remove('hidden');
            } else {
                textAContent.innerHTML = currentPair.textA.redacted;
                textBContent.innerHTML = currentPair.textB.redacted;
                revealBtn.textContent = 'Show Full Text';

                revealBtn.classList.add('hidden');
                explanationContainer.classList.add('hidden');
                explanationContent.innerHTML = '';

                attemptBtn.classList.remove('hidden');
            }
        }


        document.addEventListener('DOMContentLoaded', () => {
            renderText(0);
            taskSelect.dispatchEvent(new Event('change'));
        });


        revealBtn.addEventListener('click', toggleReveal);

        if (attemptBtn) {
            attemptBtn.addEventListener('click', () => {
                attemptBtn.classList.add('hidden');
                revealBtn.classList.remove('hidden');
            });
        }

        submitQuizBtn.addEventListener('click', handleQuizSubmit);

        exampleSelect.addEventListener('change', () => renderText(exampleSelect.value));


        tabAnalyzer.addEventListener('click', () => {
            analyzerContainer.classList.remove('hidden');
            detectiveContainer.classList.add('hidden');
            tabAnalyzer.classList.add('tab-active');
            tabAnalyzer.classList.remove('tab-inactive');
            tabDetective.classList.add('tab-inactive');
            tabDetective.classList.remove('tab-active');
        });

        tabDetective.addEventListener('click', () => {
            analyzerContainer.classList.add('hidden');
            detectiveContainer.classList.remove('hidden');
            tabDetective.classList.add('tab-active');
            tabDetective.classList.remove('tab-inactive');
            tabAnalyzer.classList.add('tab-inactive');
            tabAnalyzer.classList.remove('tab-active');
        });