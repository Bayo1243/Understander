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


        const textPairs = [
             {
                 textA: {
                     redacted: "The <code>&nbsp;&nbsp;&nbsp;</code> of <strong>AI</strong> and <strong>automation</strong> is <code>&nbsp;&nbsp;&nbsp;</code> <strong>changing</strong> <code>&nbsp;&nbsp;&nbsp;</code>. <strong>Tasks</strong> that <code>&nbsp;&nbsp;&nbsp;</code> required <strong>human</strong> <code>&nbsp;&nbsp;&nbsp;</code> are <code>&nbsp;&nbsp;&nbsp;</code> being <code>&nbsp;&nbsp;&nbsp;</code> <strong>efficiently</strong> by <strong>machines</strong>. This <code>&nbsp;&nbsp;&nbsp;</code> leads to <code>&nbsp;&nbsp;&nbsp;</code> <strong>productivity</strong>, but <strong>also</strong> <code>&nbsp;&nbsp;&nbsp;</code> concerns about <strong>job displacement</strong> for <strong>workers</strong> in <code>&nbsp;&nbsp;&nbsp;</code> roles.<br><br><strong>However</strong>, this <strong>technological shift</strong> <strong>also</strong> <strong>creates</strong> <strong>new roles</strong> <code>&nbsp;&nbsp;&nbsp;</code>. There is a <code>&nbsp;&nbsp;&nbsp;</code> <strong>demand</strong> for <strong>data scientists</strong>, <strong>AI specialists</strong>, and <code>&nbsp;&nbsp;&nbsp;</code> <strong>engineers</strong> who can <code>&nbsp;&nbsp;&nbsp;</code>, <code>&nbsp;&nbsp;&nbsp;</code>, and <strong>manage</strong> these <strong>new technologies</strong>. This <code>&nbsp;&nbsp;&nbsp;</code> a <code>&nbsp;&nbsp;&nbsp;</code> <strong>economic shift</strong>, <code>&nbsp;&nbsp;&nbsp;</code> a <strong>workforce</strong> that can <code>&nbsp;&nbsp;&nbsp;</code>.<br><br>The <strong>challenge</strong> <code>&nbsp;&nbsp;&nbsp;</code> in <code>&nbsp;&nbsp;&nbsp;</code> the <strong>current workforce</strong> to <code>&nbsp;&nbsp;&nbsp;</code> these <strong>new jobs</strong>. <strong>Investment</strong> in <strong>education</strong> and <code>&nbsp;&nbsp;&nbsp;</code> programs is <code>&nbsp;&nbsp;&nbsp;</code> to <strong>ensure</strong> that the <strong>benefits</strong> of <strong>automation</strong> are <code>&nbsp;&nbsp;&nbsp;</code> <strong>shared</strong> and <strong>workers</strong> are not <code>&nbsp;&nbsp;&nbsp;</code> behind.",
                     full: "The proliferation of AI and automation is fundamentally changing industries. Tasks that previously required human intervention are now being performed efficiently by machines. This technological leap leads to increased productivity, but also raises concerns about job displacement for workers in routine roles.\n\nHowever, this technological shift also creates new roles entirely. There is a burgeoning demand for data scientists, AI specialists, and robotics engineers who can design, build, and manage these new technologies. This represents a significant economic shift, requiring a workforce that can adapt.\n\nThe challenge lies in retraining the current workforce to fill these new jobs. Investment in education and vocational programs is crucial to ensure that the benefits of automation are broadly shared and workers are not left behind."
                 },
                 textB: {
                      redacted: "<code>&nbsp;&nbsp;&nbsp;</code> <strong>communication technologies</strong>, <code>&nbsp;&nbsp;&nbsp;</code> <strong>social media</strong>, have <code>&nbsp;&nbsp;&nbsp;</code> how <strong>people</strong> maintain <strong>relationships</strong>. <strong>Individuals</strong> can <code>&nbsp;&nbsp;&nbsp;</code> <strong>connected</strong> with <strong>friends</strong> and <strong>family</strong> <code>&nbsp;&nbsp;&nbsp;</code> geographical <strong>distances</strong>, <code>&nbsp;&nbsp;&nbsp;</code> a sense of <strong>community</strong> <code>&nbsp;&nbsp;&nbsp;</code> borders.<br><br><strong>On the other hand</strong>, <code>&nbsp;&nbsp;&nbsp;</code> <strong>studies</strong> suggest this <code>&nbsp;&nbsp;&nbsp;</code> <strong>connectivity</strong> may be <code>&nbsp;&nbsp;&nbsp;</code> to <code>&nbsp;&nbsp;&nbsp;</code> feelings of <strong>anxiety</strong> and <strong>social isolation</strong>. The <code>&nbsp;&nbsp;&nbsp;</code> nature of <strong>online</strong> <code>&nbsp;&nbsp;&nbsp;</code> can <strong>lack</strong> the <code>&nbsp;&nbsp;&nbsp;</code> of <strong>face-to-face</strong> <strong>communication</strong>, <code>&nbsp;&nbsp;&nbsp;</code> <strong>impacting</strong> <strong>mental health</strong> and <strong>social skills</strong>.<br><br><code>&nbsp;&nbsp;&nbsp;</code>, the <code>&nbsp;&nbsp;&nbsp;</code> <strong>algorithms</strong> used by these <strong>platforms</strong> can <code>&nbsp;&nbsp;&nbsp;</code> echo chambers, <code>&nbsp;&nbsp;&nbsp;</code> <strong>people</strong> to <code>&nbsp;&nbsp;&nbsp;</code> <strong>views</strong> and <code>&nbsp;&nbsp;&nbsp;</code> <strong>polarization</strong> within <strong>society</strong>. This <code>&nbsp;&nbsp;&nbsp;</code> <strong>understanding</strong> and <code>&nbsp;&nbsp;&nbsp;</code> <strong>dialogue</strong>.",
                      full: "Digital communication technologies, particularly social media, have reshaped how people maintain relationships. Individuals can remain connected with friends and family across geographical distances, fostering a sense of community beyond borders.\n\nOn the other hand, numerous studies suggest this constant connectivity may be contributing to increased feelings of anxiety and social isolation. The curated nature of online interactions can lack the depth of face-to-face communication, potentially impacting mental health and social skills.\n\nFurthermore, the engagement-maximizing algorithms used by these platforms can create echo chambers, exposing people to reinforcing views and increasing polarization within society. This hinders understanding and constructive dialogue."
                 },
                 explanation: `
                     <ul>
                         <li><strong>Similarity:</strong> Both texts discuss the <strong>significant changes</strong> and <strong>impacts</strong> brought about by <strong>modern technologies</strong>.</li>
                         <li><strong>Difference:</strong> The key difference is the *area* of impact.
                             <ul>
                                 <li>Text A focuses on the <strong>economic and professional sphere</strong>, discussing <strong>AI</strong>, <strong>automation</strong>, <strong>industries</strong>, <strong>productivity</strong>, <strong>job displacement</strong>, <strong>workers</strong>, and the creation of <strong>new roles</strong> like <strong>data scientists</strong>. It also mentions the need for <strong>education</strong> and <strong>investment</strong>.</li>
                                 <li>Text B focuses on the <strong>social and psychological sphere</strong>, discussing <strong>communication technologies</strong>, <strong>social media</strong>, <strong>relationships</strong>, <strong>community</strong>, feelings of <strong>anxiety</strong> and <strong>social isolation</strong>, <strong>face-to-face communication</strong>, <strong>mental health</strong>, and <strong>polarization</strong> in <strong>society</strong>.</li>
                             </ul>
                         </li>
                         <li><strong>Signal Words:</strong> Text A uses <code>However</code> to introduce the creation of new jobs as a contrast to job displacement. Text B uses <code>On the other hand</code> to introduce the negative psychological impacts as a contrast to the benefit of connection, and <code>Furthermore</code> to add the issue of polarization.</li>
                     </ul>
                 `,
                 quiz: {
                     question: "What is the main difference between Text A and Text B regarding the impact of technology?",
                     options: [
                         "Text A focuses on job losses, while Text B focuses on job gains.",
                         "Text A discusses economic impacts, while Text B discusses social impacts.",
                         "Text A is optimistic about technology, while Text B is pessimistic.",
                         "Text A discusses AI, while Text B discusses social media."
                     ],
                     correctAnswerIndex: 1
                 }
             },
             {
                 textA: {
                     redacted: "The <code>&nbsp;&nbsp;&nbsp;</code> of <strong>plastic pollution</strong> in our <strong>oceans</strong> has <code>&nbsp;&nbsp;&nbsp;</code> <code>&nbsp;&nbsp;&nbsp;</code> levels. <strong>Marine life</strong>, <code>&nbsp;&nbsp;&nbsp;</code> turtles and whales, <code>&nbsp;&nbsp;&nbsp;</code> <strong>mistake</strong> plastic <code>&nbsp;&nbsp;&nbsp;</code> for <strong>food</strong>. This <code>&nbsp;&nbsp;&nbsp;</code> <strong>kills</strong> animals <code>&nbsp;&nbsp;&nbsp;</code> <strong>but also</strong> introduces <code>&nbsp;&nbsp;&nbsp;</code> into the <strong>food chain</strong>, <code>&nbsp;&nbsp;&nbsp;</code> reaching <strong>humans</strong>.<br><br><strong>Furthermore</strong>, these <strong>microplastics</strong> <code>&nbsp;&nbsp;&nbsp;</code> in the <code>&nbsp;&nbsp;&nbsp;</code> of <strong>marine animals</strong>, <code>&nbsp;&nbsp;&nbsp;</code> <strong>working</strong> their <strong>way up</strong> to <strong>humans</strong> who <code>&nbsp;&nbsp;&nbsp;</code> <strong>seafood</strong>. The <strong>long-term</strong> <code>&nbsp;&nbsp;&nbsp;</code> on <strong>human health</strong> are <code>&nbsp;&nbsp;&nbsp;</code> <strong>unknown</strong> but <code>&nbsp;&nbsp;&nbsp;</code> <strong>concerning</strong>.<br><br><code>&nbsp;&nbsp;&nbsp;</code> clean-up <code>&nbsp;&nbsp;&nbsp;</code> are <code>&nbsp;&nbsp;&nbsp;</code>, but the <code>&nbsp;&nbsp;&nbsp;</code> <strong>volume</strong> of plastic makes <code>&nbsp;&nbsp;&nbsp;</code> <strong>solutions</strong> <strong>difficult</strong>. <strong>Reducing</strong> plastic <strong>consumption</strong> at the <strong>source</strong> <code>&nbsp;&nbsp;&nbsp;</code> a <code>&nbsp;&nbsp;&nbsp;</code> <strong>challenge</strong>.",
                     full: "The accumulation of plastic pollution in our oceans has reached critical levels. Marine life, particularly turtles and whales, tragically mistake plastic debris for food. This not only kills animals directly but also introduces toxins into the food chain, potentially reaching humans.\n\nFurthermore, these microplastics accumulate in the tissues of marine animals, eventually working their way up to humans who consume seafood. The long-term consequences on human health are still largely unknown but deeply concerning.\n\nLarge-scale clean-up initiatives are underway, but the sheer volume of plastic makes comprehensive solutions difficult. Reducing plastic consumption at the source remains a critical challenge."
                 },
                 textB: {
                     redacted: "<strong>While</strong> the <strong>ocean</strong> <code>&nbsp;&nbsp;&nbsp;</code> gets attention, <strong>plastic pollution</strong> on <strong>land</strong> is <code>&nbsp;&nbsp;&nbsp;</code> as <strong>dangerous</strong>. <code>&nbsp;&nbsp;&nbsp;</code> plastics in <strong>soil</strong> can <strong>reduce</strong> crop <code>&nbsp;&nbsp;&nbsp;</code> and <strong>contaminate</strong> <code>&nbsp;&nbsp;&nbsp;</code>, <code>&nbsp;&nbsp;&nbsp;</code> <strong>threatening</strong> our <strong>food supply</strong> at its <strong>source</strong>. This <code>&nbsp;&nbsp;&nbsp;</code> of pollution is <code>&nbsp;&nbsp;&nbsp;</code> less visible but <code>&nbsp;&nbsp;&nbsp;</code> pervasive.<br><br><strong>Moreover</strong>, the <code>&nbsp;&nbsp;&nbsp;</code> of plastic waste in <strong>landfills</strong> or <code>&nbsp;&nbsp;&nbsp;</code> <strong>incineration</strong> <strong>releases</strong> toxic <code>&nbsp;&nbsp;&nbsp;</code> into the <strong>air</strong>. This <code>&nbsp;&nbsp;&nbsp;</code> <strong>air pollution</strong> <strong>directly</strong> <code>&nbsp;&nbsp;&nbsp;</code> the <strong>respiratory health</strong> of <strong>nearby communities</strong>, a <strong>problem</strong> that is <code>&nbsp;&nbsp;&nbsp;</code> <strong>immediate</strong>.<br><br><code>&nbsp;&nbsp;&nbsp;</code> <strong>land-based</strong> plastic requires <code>&nbsp;&nbsp;&nbsp;</code> <strong>waste management infrastructure</strong> and <code>&nbsp;&nbsp;&nbsp;</code> <strong>alternatives</strong> to <code>&nbsp;&nbsp;&nbsp;</code> plastic products. <strong>Community</strong> <code>&nbsp;&nbsp;&nbsp;</code> and <code>&nbsp;&nbsp;&nbsp;</code> <strong>action</strong> are <strong>key</strong>.",
                     full: "While the ocean crisis gets attention, plastic pollution on land is arguably as dangerous. Microplastics in soil can reduce crop yields and contaminate groundwater, threatening our food supply at its source. This form of pollution is often less visible but equally pervasive.\n\nMoreover, the mismanagement of plastic waste in landfills or through open incineration releases toxic chemicals into the air. This atmospheric air pollution directly impacts the respiratory health of nearby communities, a problem that is often more immediate.\n\nAddressing land-based plastic requires improved waste management infrastructure and sustainable alternatives to single-use plastic products. Community awareness and governmental action are key."
                 },
                 explanation: `
                     <ul>
                         <li><strong>Similarity:</strong> Both texts discuss the <strong>serious dangers</strong> and widespread <strong>problem</strong> of <strong>plastic pollution</strong>, mentioning its threat to the <strong>food supply</strong> and <strong>human health</strong>.</li>
                         <li><strong>Difference:</strong> The main difference is the *primary environment* discussed.
                             <ul>
                                 <li>Text A focuses almost exclusively on <strong>plastic pollution</strong> in the <strong>oceans</strong>, highlighting its impact on <strong>marine life</strong>, the <strong>food chain</strong> via <strong>seafood</strong>, and the <strong>difficulty</strong> of clean-up solutions there.</li>
                                 <li>Text B uses the signal word <code>While</code> to acknowledge the ocean issue but pivots to argue that pollution on <strong>land</strong> is equally <strong>dangerous</strong>. It focuses on impacts on <strong>soil</strong>, groundwater, crops (<strong>food supply</strong> at the <strong>source</strong>), <strong>landfills</strong>, and <strong>air pollution</strong> affecting <strong>nearby communities</strong>. It also mentions solutions like <strong>waste management</strong>.</li>
                             </ul>
                         </li>
                          <li><strong>Signal Words:</strong> Text A uses <code>Furthermore</code> to add the point about microplastics reaching humans. Text B uses <code>While</code> to contrast land pollution with ocean pollution and <code>Moreover</code> to add the issue of air pollution from waste mismanagement.</li>
                     </ul>
                 `,
                  quiz: {
                     question: "According to the texts, what is the primary difference in focus regarding plastic pollution?",
                     options: [
                         "Text A focuses on animals, Text B focuses on humans.",
                         "Text A focuses on microplastics, Text B focuses on large debris.",
                         "Text A focuses on ocean pollution, Text B focuses on land and air pollution.",
                         "Text A is about long-term effects, Text B is about immediate effects."
                     ],
                     correctAnswerIndex: 2
                 }
             },
              {
                 textA: {
                     redacted: "The <strong>American Revolution</strong> is <code>&nbsp;&nbsp;&nbsp;</code> <code>&nbsp;&nbsp;&nbsp;</code> as a <strong>war</strong> over <strong>taxes</strong> and <strong>trade</strong>. <code>&nbsp;&nbsp;&nbsp;</code> like the Stamp Act <code>&nbsp;&nbsp;&nbsp;</code> the slogan 'no taxation without representation'. This <strong>economic</strong> <code>&nbsp;&nbsp;&nbsp;</code> was <code>&nbsp;&nbsp;&nbsp;</code> a central <strong>cause</strong>, <code>&nbsp;&nbsp;&nbsp;</code> colonists to <strong>protest</strong> <code>&nbsp;&nbsp;&nbsp;</code> British <strong>control</strong> over their <strong>financial</strong> <code>&nbsp;&nbsp;&nbsp;</code>.<br><br>These <strong>financial burdens</strong>, <code>&nbsp;&nbsp;&nbsp;</code> with <strong>trade restrictions</strong> <code>&nbsp;&nbsp;&nbsp;</code> by <strong>mercantilism</strong>, <code>&nbsp;&nbsp;&nbsp;</code> a <strong>powerful</strong> <code>&nbsp;&nbsp;&nbsp;</code> for <strong>rebellion</strong> among <code>&nbsp;&nbsp;&nbsp;</code> and <code>&nbsp;&nbsp;&nbsp;</code> alike. The <code>&nbsp;&nbsp;&nbsp;</code> of <strong>economic freedom</strong> and the <code>&nbsp;&nbsp;&nbsp;</code> to <strong>profit</strong> from their <code>&nbsp;&nbsp;&nbsp;</code> labor was a <code>&nbsp;&nbsp;&nbsp;</code> <strong>call</strong> to <strong>arms</strong>, <code>&nbsp;&nbsp;&nbsp;</code> diverse groups against <code>&nbsp;&nbsp;&nbsp;</code> British <code>&nbsp;&nbsp;&nbsp;</code>.<br><br>The Boston Tea Party, a <code>&nbsp;&nbsp;&nbsp;</code> protest against tea taxes and monopolies, <code>&nbsp;&nbsp;&nbsp;</code> how central these <strong>economic issues</strong> were in <code>&nbsp;&nbsp;&nbsp;</code> tensions. It <code>&nbsp;&nbsp;&nbsp;</code> a willingness to <code>&nbsp;&nbsp;&nbsp;</code> direct action over <strong>financial control</strong>.",
                     full: "The American Revolution is often portrayed as a war over taxes and trade. Policies like the Stamp Act fueled the slogan 'no taxation without representation'. This economic grievance was certainly a central cause, motivating colonists to protest British control over their financial affairs.\n\nThese financial burdens, coupled with trade restrictions imposed by mercantilism, created a powerful incentive for rebellion among merchants and farmers alike. The desire for economic freedom and the ability to profit from their own labor was a tangible call to arms, uniting diverse groups against perceived British exploitation.\n\nThe Boston Tea Party, a direct protest against tea taxes and monopolies, exemplifies how central these economic issues were in escalating tensions. It demonstrated a willingness to take direct action over financial control."
                 },
                 textB: {
                     redacted: "<strong>However</strong>, <code>&nbsp;&nbsp;&nbsp;</code> the <strong>American Revolution</strong> <code>&nbsp;&nbsp;&nbsp;</code> to <strong>economics</strong> ignores <code>&nbsp;&nbsp;&nbsp;</code> <strong>ideological</strong> factors. The <code>&nbsp;&nbsp;&nbsp;</code> of the Enlightenment, <code>&nbsp;&nbsp;&nbsp;</code> <strong>ideas</strong> about <strong>liberty</strong>, natural <strong>rights</strong>, and <code>&nbsp;&nbsp;&nbsp;</code>, <code>&nbsp;&nbsp;&nbsp;</code> the <strong>intellectual</strong> <code>&nbsp;&nbsp;&nbsp;</code> for <strong>independence</strong> and republican government.<br><br>This <strong>philosophy</strong> was <code>&nbsp;&nbsp;&nbsp;</code> <strong>important</strong> as the <strong>taxes</strong> in <code>&nbsp;&nbsp;&nbsp;</code> the revolutionary mindset. <code>&nbsp;&nbsp;&nbsp;</code> like Thomas Paine <code>&nbsp;&nbsp;&nbsp;</code> these <strong>ideas</strong>, <code>&nbsp;&nbsp;&nbsp;</code> <strong>public opinion</strong> <code>&nbsp;&nbsp;&nbsp;</code> a <code>&nbsp;&nbsp;&nbsp;</code> <strong>break</strong> from the <strong>monarchy</strong>, arguing for self-governance, not just <code>&nbsp;&nbsp;&nbsp;</code> <strong>financial</strong> <code>&nbsp;&nbsp;&nbsp;</code>.<br><br>The Declaration of Independence <code>&nbsp;&nbsp;&nbsp;</code> is <code>&nbsp;&nbsp;&nbsp;</code> a document rooted in these Enlightenment <strong>principles</strong>, <code>&nbsp;&nbsp;&nbsp;</code> a case for revolution based on universal <strong>rights</strong> <code>&nbsp;&nbsp;&nbsp;</code> than specific <strong>economic complaints</strong>, <code>&nbsp;&nbsp;&nbsp;</code> the deep <strong>ideological</strong> commitment.",
                     full: "However, reducing the American Revolution solely to economics ignores powerful ideological factors. The influence of the Enlightenment, particularly ideas about liberty, natural rights, and self-governance, provided the intellectual framework for independence and republican government.\n\nThis philosophy was just as important as the taxes in shaping the revolutionary mindset. Writers like Thomas Paine translated these ideas, mobilizing public opinion toward a radical break from the monarchy, arguing for self-governance, not just simple financial relief.\n\nThe Declaration of Independence itself is primarily a document rooted in these Enlightenment principles, articulating a case for revolution based on universal rights rather than specific economic complaints, demonstrating the deep ideological commitment."
                 },
                 explanation: `
                     <ul>
                         <li><strong>Similarity:</strong> Both texts analyze the <strong>causes</strong> of the <strong>American Revolution</strong>. Both acknowledge that <strong>taxes</strong> and <strong>economic issues</strong> played a role.</li>
                         <li><strong>Difference:</strong> The primary difference is the *emphasis* on the driving force.
                             <ul>
                                 <li>Text A emphasizes the <strong>economic</strong> motivations, focusing on <strong>"taxes"</strong>, <strong>"trade"</strong>, <strong>"economic grievance"</strong>, <strong>"financial burdens"</strong>, <strong>"mercantilism"</strong>, and <strong>"economic freedom"</strong> as the central reasons for the <strong>rebellion</strong>.</li>
                                 <li>Text B begins with the signal word <code>However</code>, indicating a counter-argument. It emphasizes the <strong>ideological</strong> motivations rooted in Enlightenment <strong>philosophy</strong>, focusing on <strong>"ideas"</strong> about <strong>"liberty"</strong>, <strong>"rights"</strong>, <strong>"self-governance"</strong>, and the <strong>"intellectual framework"</strong> for <strong>independence</strong>. It explicitly argues these were "just as <strong>important</strong> as the <strong>taxes</strong>".</li>
                             </ul>
                         </li>
                     </ul>
                 `,
                  quiz: {
                     question: "Text B presents a different perspective than Text A on the American Revolution by emphasizing:",
                     options: [
                         "The role of international trade.",
                         "The importance of key military leaders.",
                         "The influence of philosophical ideas.",
                         "The impact of British control over land."
                     ],
                     correctAnswerIndex: 2
                 }
             },
             {
                 textA: {
                      redacted: "Modern <strong>medicine</strong> has <code>&nbsp;&nbsp;&nbsp;</code> in <strong>treating chronic diseases</strong> like <code>&nbsp;&nbsp;&nbsp;</code> and heart conditions. New <code>&nbsp;&nbsp;&nbsp;</code> can <code>&nbsp;&nbsp;&nbsp;</code> <strong>manage symptoms</strong>, <code>&nbsp;&nbsp;&nbsp;</code> quality of life for <strong>patients</strong> and <code>&nbsp;&nbsp;&nbsp;</code> lifespans. The <strong>focus</strong> is <code>&nbsp;&nbsp;&nbsp;</code> on <code>&nbsp;&nbsp;&nbsp;</code> <strong>drugs</strong> that <code>&nbsp;&nbsp;&nbsp;</code> specific <strong>symptoms</strong> or biological <code>&nbsp;&nbsp;&nbsp;</code> as they <strong>arise</strong>.<br><br>This <strong>approach</strong>, <code>&nbsp;&nbsp;&nbsp;</code> on <strong>reacting</strong> to <strong>illness</strong> <code>&nbsp;&nbsp;&nbsp;</code> it has developed, <code>&nbsp;&nbsp;&nbsp;</code> heavily on <strong>pharmaceuticals</strong> and <code>&nbsp;&nbsp;&nbsp;</code> complex <code>&nbsp;&nbsp;&nbsp;</code> <strong>interventions</strong> like surgery. <strong>Research</strong> <code>&nbsp;&nbsp;&nbsp;</code> <strong>pours</strong> <strong>money</strong> into <code>&nbsp;&nbsp;&nbsp;</code> <strong>better</strong> <strong>treatments</strong> and cures <code>&nbsp;&nbsp;&nbsp;</code> than fully <code>&nbsp;&nbsp;&nbsp;</code> underlying <strong>causes</strong>.<br><br><code>&nbsp;&nbsp;&nbsp;</code> screening and diagnostic tools <code>&nbsp;&nbsp;&nbsp;</code> for earlier detection, but the <code>&nbsp;&nbsp;&nbsp;</code> strategy <code>&nbsp;&nbsp;&nbsp;</code> managing the disease after it is <code>&nbsp;&nbsp;&nbsp;</code>, often <code>&nbsp;&nbsp;&nbsp;</code> lifelong medication or monitoring.",
                      full: "Modern medicine has excelled in treating chronic diseases like diabetes and heart conditions. New pharmaceuticals can effectively manage symptoms, improving quality of life for patients and extending lifespans. The focus is often on developing drugs that target specific symptoms or biological pathways as they arise.\n\nThis approach, centered on reacting to illness once it has developed, relies heavily on pharmaceuticals and often complex medical interventions like surgery. Research consequently pours money into finding better treatments and cures rather than fully exploring underlying causes.\n\nAdvanced screening and diagnostic tools allow for earlier detection, but the primary strategy remains managing the disease after it is present, often requiring lifelong medication or monitoring."
                 },
                 textB: {
                     redacted: "<strong>In contrast</strong>, a <code>&nbsp;&nbsp;&nbsp;</code> <code>&nbsp;&nbsp;&nbsp;</code> in <strong>medicine</strong>, often called functional or <strong>preventive</strong> medicine, emphasizes <strong>disease prevention</strong> and <code>&nbsp;&nbsp;&nbsp;</code> the origins of illness. This <code>&nbsp;&nbsp;&nbsp;</code> <strong>focuses</strong> on the <strong>root causes</strong> of <strong>chronic diseases</strong>, such as <strong>diet</strong>, <strong>exercise</strong>, sleep <code>&nbsp;&nbsp;&nbsp;</code>, and <code>&nbsp;&nbsp;&nbsp;</code> stress. This <strong>approach</strong> is <strong>proactive</strong>, <code>&nbsp;&nbsp;&nbsp;</code> to optimize health <code>&nbsp;&nbsp;&nbsp;</code> disease occurs.<br><br>By <code>&nbsp;&nbsp;&nbsp;</code> <strong>lifestyle</strong> changes and <code>&nbsp;&nbsp;&nbsp;</code> <strong>environmental factors</strong> like toxin exposure, <strong>preventive</strong> <strong>medicine</strong> aims to <strong>stop</strong> <strong>illness</strong> <code>&nbsp;&nbsp;&nbsp;</code> it <code>&nbsp;&nbsp;&nbsp;</code> or reverse early <code>&nbsp;&nbsp;&nbsp;</code> of dysfunction. This <code>&nbsp;&nbsp;&nbsp;</code> could lead to <code>&nbsp;&nbsp;&nbsp;</code> <strong>healthier populations</strong> and significantly <strong>reduce</strong> the long-term <strong>burden</strong> and cost on <strong>healthcare systems</strong>.<br><br><code>&nbsp;&nbsp;&nbsp;</code> in this field often <code>&nbsp;&nbsp;&nbsp;</code> more time with patients, <code>&nbsp;&nbsp;&nbsp;</code> detailed histories and using <code>&nbsp;&nbsp;&nbsp;</code> testing to understand individual <code>&nbsp;&nbsp;&nbsp;</code> and triggers, <code>&nbsp;&nbsp;&nbsp;</code> for personalized wellness plans.",
                     full: "In contrast, a growing movement in medicine, often called functional or preventive medicine, emphasizes disease prevention and addressing the origins of illness. This approach focuses on the root causes of chronic diseases, such as diet, exercise, sleep patterns, and environmental stress. This approach is proactive, seeking to optimize health before disease occurs.\n\nBy modifying lifestyle changes and addressing environmental factors like toxin exposure, preventive medicine aims to stop illness before it begins or reverse early signs of dysfunction. This shift could lead to far healthier populations and significantly reduce the long-term burden and cost on healthcare systems.\n\nPractitioners in this field often spend more time with patients, exploring detailed histories and using advanced testing to understand individual predispositions and triggers, aiming for personalized wellness plans."
                 },
                 explanation: `
                     <ul>
                         <li><strong>Similarity:</strong> Both texts discuss approaches within <strong>medicine</strong> regarding <strong>chronic diseases</strong> and improving <strong>health</strong>.</li>
                         <li><strong>Difference:</strong> The core difference lies in their *timing and focus*.
                             <ul>
                                 <li>Text A describes the conventional approach focused on <strong>treating</strong> and <strong>managing symptoms</strong> of diseases *after* they <strong>arise</strong> (a <strong>"reacting"</strong> strategy). It emphasizes the role of <strong>pharmaceuticals</strong>, <strong>interventions</strong>, and <strong>treatments</strong>.</li>
                                 <li>Text B starts with the signal phrase <code>In contrast</code>. It describes an approach focused on <strong>disease prevention</strong> by addressing <strong>"root causes"</strong> *before* illness develops (a <strong>"proactive"</strong> strategy). It emphasizes factors like <strong>"diet"</strong>, <strong>"exercise"</strong>, <strong>"lifestyle"</strong>, and <strong>"environmental factors"</strong> to <strong>"stop illness"</strong>.</li>
                             </ul>
                         </li>
                     </ul>
                 `,
                  quiz: {
                     question: "What is the core difference between the medical approaches described in Text A and Text B?",
                     options: [
                         "Text A uses drugs, Text B uses surgery.",
                         "Text A focuses on treatment, Text B focuses on prevention.",
                         "Text A deals with chronic diseases, Text B deals with acute illnesses.",
                         "Text A is about research, Text B is about patient care."
                     ],
                     correctAnswerIndex: 1
                 }
             },
             {
                 textA: {
                     redacted: "A <strong>'top-down' economic</strong> <code>&nbsp;&nbsp;&nbsp;</code>, <code>&nbsp;&nbsp;&nbsp;</code> associated with supply-side economics, argues that <strong>benefits</strong> <code>&nbsp;&nbsp;&nbsp;</code> <strong>corporations</strong> and the <strong>wealthy</strong> will <code>&nbsp;&nbsp;&nbsp;</code> <strong>trickle down</strong> to the <code>&nbsp;&nbsp;&nbsp;</code> of the population. <code>&nbsp;&nbsp;&nbsp;</code> tax cuts for <strong>businesses</strong> and high-income earners, the <strong>theory</strong> <code>&nbsp;&nbsp;&nbsp;</code>, encourages <strong>investment</strong> and capital <code>&nbsp;&nbsp;&nbsp;</code>.<br><br>This <strong>investment</strong> <code>&nbsp;&nbsp;&nbsp;</code> leads to <strong>businesses</strong> <code>&nbsp;&nbsp;&nbsp;</code>, stimulating <strong>job creation</strong>, increasing <code>&nbsp;&nbsp;&nbsp;</code>, and generating <code>&nbsp;&nbsp;&nbsp;</code> <strong>economic</strong> <code>&nbsp;&nbsp;&nbsp;</code> for all. The <code>&nbsp;&nbsp;&nbsp;</code> is that <strong>growth</strong> <code>&nbsp;&nbsp;&nbsp;</code> at the <strong>top</strong> of the economic pyramid and <code>&nbsp;&nbsp;&nbsp;</code> <strong>down</strong>, benefiting society <code>&nbsp;&nbsp;&nbsp;</code>.<br><br><code>&nbsp;&nbsp;&nbsp;</code> argue this leads to greater <code>&nbsp;&nbsp;&nbsp;</code> wealth generation, <code>&nbsp;&nbsp;&nbsp;</code> if initial benefits are <code>&nbsp;&nbsp;&nbsp;</code>. They believe that a thriving business sector is the <code>&nbsp;&nbsp;&nbsp;</code> engine of prosperity.",
                     full: "A 'top-down' economic theory, often associated with supply-side economics, argues that benefits provided to corporations and the wealthy will eventually trickle down to the rest of the population. By cutting taxes for businesses and high-income earners, the theory states, this encourages investment and capital formation.\n\nThis investment in turn leads to businesses expanding, stimulating job creation, increasing wages, and generating overall economic prosperity for all. The assumption is that growth starts at the top of the economic pyramid and flows down, benefiting society as a whole.\n\nProponents argue this leads to greater overall wealth generation, even if initial benefits are concentrated. They believe that a thriving business sector is the primary engine of prosperity."
                 },
                 textB: {
                     redacted: "<strong>On the other hand</strong>, <strong>'bottom-up' economic</strong> <strong>theory</strong>, <code>&nbsp;&nbsp;&nbsp;</code> linked to demand-side economics, <code>&nbsp;&nbsp;&nbsp;</code> that <strong>growth</strong> is <code>&nbsp;&nbsp;&nbsp;</code> <code>&nbsp;&nbsp;&nbsp;</code> by the spending power of average <strong>consumers</strong>. This <strong>approach</strong> <code>&nbsp;&nbsp;&nbsp;</code> putting more <strong>money</strong> and resources <code>&nbsp;&nbsp;&nbsp;</code> into the <strong>hands</strong> of middle and <strong>working-class citizens</strong> through higher wages, <code>&nbsp;&nbsp;&nbsp;</code> programs, or targeted tax <code>&nbsp;&nbsp;&nbsp;</code>.<br><br>When these <strong>people</strong> have more disposable <strong>money</strong> to <strong>spend</strong>, <code>&nbsp;&nbsp;&nbsp;</code> drives increased <strong>demand</strong> for <code>&nbsp;&nbsp;&nbsp;</code> and <strong>services</strong> <code>&nbsp;&nbsp;&nbsp;</code> the economy. <strong>Businesses</strong> must then <code>&nbsp;&nbsp;&nbsp;</code> production and <strong>hire</strong> more <strong>workers</strong> to <code>&nbsp;&nbsp;&nbsp;</code> this consumer <strong>demand</strong>, <code>&nbsp;&nbsp;&nbsp;</code> sustainable <strong>growth</strong> from the <strong>bottom</strong> of the economic pyramid <code>&nbsp;&nbsp;&nbsp;</code>.<br><br><code>&nbsp;&nbsp;&nbsp;</code> believe this fosters more <code>&nbsp;&nbsp;&nbsp;</code> growth and reduces income <code>&nbsp;&nbsp;&nbsp;</code>, creating a more stable consumer base that <code>&nbsp;&nbsp;&nbsp;</code> all businesses in the long run.",
                     full: "On the other hand, 'bottom-up' economic theory, often linked to demand-side economics, suggests that growth is primarily driven by the spending power of average consumers. This approach favors putting more money and resources directly into the hands of middle and working-class citizens through higher wages, social programs, or targeted tax relief.\n\nWhen these people have more disposable money to spend, this drives increased demand for goods and services across the economy. Businesses must then expand production and hire more workers to meet this consumer demand, creating sustainable growth from the bottom of the economic pyramid upwards.\n\nAdvocates believe this fosters more equitable growth and reduces income inequality, creating a more stable consumer base that benefits all businesses in the long run."
                 },
                 explanation: `
                     <ul>
                         <li><strong>Similarity:</strong> Both texts describe competing <strong>economic theories</strong> aimed at achieving overall <strong>economic growth</strong> and <strong>job creation</strong>. Both involve government policy (like taxes) influencing the economy.</li>
                         <li><strong>Difference:</strong> The core difference is *where* the economic stimulus should begin.
                             <ul>
                                 <li>Text A describes a <strong>"top-down"</strong> theory where benefits (like tax cuts) are given to <strong>"corporations"</strong> and the <strong>"wealthy"</strong> at the <strong>"top"</strong>, expecting the positive effects (like <strong>"investment"</strong>) to <code>trickle down</code>.</li>
                                 <li>Text B uses the signal phrase <code>On the other hand</code> to introduce the opposite view. It describes a <strong>"bottom-up"</strong> theory where resources (like higher wages or direct support) are given to <strong>"consumers"</strong> and <strong>"working-class citizens"</strong> at the <strong>"bottom"</strong>, expecting their increased <strong>"spending"</strong> to drive <strong>"demand"</strong> and stimulate businesses from below.</li>
                             </ul>
                         </li>
                     </ul>
                 `,
                  quiz: {
                     question: "What is the primary driver of economic growth according to the theory in Text B, contrasting with Text A?",
                     options: [
                         "Corporate investment",
                         "Government spending",
                         "Consumer demand",
                         "International trade"
                     ],
                     correctAnswerIndex: 2
                 }
             },
             {
                 textA: {
                     redacted: "A <strong>formalist</strong> <code>&nbsp;&nbsp;&nbsp;</code> to literature <strong>focuses</strong> <code>&nbsp;&nbsp;&nbsp;</code> on the <strong>text itself</strong>, analyzing its <code>&nbsp;&nbsp;&nbsp;</code> elements. It <code>&nbsp;&nbsp;&nbsp;</code> the <strong>structure</strong> (like plot <code>&nbsp;&nbsp;&nbsp;</code> chapters), literary devices (like <strong>meter</strong>, irony, <code>&nbsp;&nbsp;&nbsp;</code>), <code>&nbsp;&nbsp;&nbsp;</code> patterns, and <strong>word choice</strong> to uncover meaning. The <strong>meaning</strong>, <code>&nbsp;&nbsp;&nbsp;</code> to this view, must be found <code>&nbsp;&nbsp;&nbsp;</code> within the <strong>'four corners'</strong> of the work itself.<br><br><code>&nbsp;&nbsp;&nbsp;</code> factors, such as the <strong>author's life</strong> experiences, <code>&nbsp;&nbsp;&nbsp;</code>, or the <strong>historical</strong> and cultural <code>&nbsp;&nbsp;&nbsp;</code> in which it was written, are considered <strong>irrelevant</strong> or <code>&nbsp;&nbsp;&nbsp;</code> to the <code>&nbsp;&nbsp;&nbsp;</code> qualities of the text. The <strong>text</strong> is treated as a <strong>self-contained</strong> artistic <code>&nbsp;&nbsp;&nbsp;</code>, <strong>separate</strong> from the <strong>world</strong> or the author's biography.<br><br>The <code>&nbsp;&nbsp;&nbsp;</code> is an objective analysis based <code>&nbsp;&nbsp;&nbsp;</code> on the evidence <code>&nbsp;&nbsp;&nbsp;</code> on the page, <code>&nbsp;&nbsp;&nbsp;</code> subjective interpretations <code>&nbsp;&nbsp;&nbsp;</code> by outside knowledge or personal feelings.",
                     full: "A formalist approach to literature focuses entirely on the text itself, analyzing its internal elements. It examines the structure (like plot and chapters), literary devices (like meter, irony, metaphor), recurring patterns, and word choice to uncover meaning. The meaning, according to this view, must be found exclusively within the 'four corners' of the work itself.\n\nExternal factors, such as the author's life experiences, intentions, or the historical and cultural context in which it was written, are considered irrelevant or secondary to the intrinsic qualities of the text. The text is treated as a self-contained artistic object, separate from the world or the author's biography.\n\nThe goal is an objective analysis based solely on the evidence present on the page, avoiding subjective interpretations influenced by outside knowledge or personal feelings."
                 },
                 textB: {
                      redacted: "A <strong>historical</strong> or biographical <code>&nbsp;&nbsp;&nbsp;</code> to literature, <strong>however</strong>, <code>&nbsp;&nbsp;&nbsp;</code> that understanding the <strong>context</strong> <code>&nbsp;&nbsp;&nbsp;</code> the work is <strong>essential</strong> for interpretation. To <code>&nbsp;&nbsp;&nbsp;</code> <strong>understand</strong> the <strong>text</strong>'s themes and nuances, one must <code>&nbsp;&nbsp;&nbsp;</code> the <strong>author's life</strong>, their personal beliefs, and the broader <strong>social</strong>, political, and cultural <code>&nbsp;&nbsp;&nbsp;</code> of the <strong>time</strong>.<br><br>This <strong>approach</strong> <code>&nbsp;&nbsp;&nbsp;</code> the literary work as a <strong>product</strong> of its specific historical <strong>time</strong> and place, <code>&nbsp;&nbsp;&nbsp;</code> <code>&nbsp;&nbsp;&nbsp;</code> by the prevailing <strong>political</strong> ideologies, <strong>social</strong> norms, and significant <strong>events</strong> <code>&nbsp;&nbsp;&nbsp;</code> its <strong>creation</strong>. The <strong>meaning</strong> is therefore seen as deeply <strong>connected</strong> to, and <code>&nbsp;&nbsp;&nbsp;</code> by, its external <strong>context</strong>.<br><br><code>&nbsp;&nbsp;&nbsp;</code> this context, proponents argue, leads to an incomplete or even <code>&nbsp;&nbsp;&nbsp;</code> reading of the text's significance and intended <code>&nbsp;&nbsp;&nbsp;</code> within its original setting.",
                      full: "A historical or biographical approach to literature, however, insists that understanding the context surrounding the work is essential for interpretation. To fully understand the text's themes and nuances, one must examine the author's life, their personal beliefs, and the broader social, political, and cultural milieu of the time.\n\nThis approach views the literary work as a product of its specific historical time and place, inevitably shaped by the prevailing political ideologies, social norms, and significant events surrounding its creation. The meaning is therefore seen as deeply connected to, and illuminated by, its external context.\n\nIgnoring this context, proponents argue, leads to an incomplete or even distorted reading of the text's significance and intended messages within its original setting."
                 },
                 explanation: `
                     <ul>
                         <li><strong>Similarity:</strong> Both texts describe distinct critical approaches used to analyze literature (like a <strong>poem</strong> or other literary <strong>text</strong>) and discover its <strong>meaning</strong>.</li>
                         <li><strong>Difference:</strong> The core difference lies in *what* information they consider valid for interpretation.
                             <ul>
                                 <li>Text A describes the <strong>"formalist"</strong> approach, which <strong>"focuses entirely on the text itself"</strong> – its internal elements like <strong>"structure"</strong>, <strong>"meter"</strong>, and <strong>"word choice"</strong>. It explicitly states that external factors like the <strong>"author's life"</strong> and <strong>"historical"</strong> context are <strong>"irrelevant"</strong>.</li>
                                 <li>Text B uses the signal word <code>however</code> to introduce a contrasting view. It describes the <strong>"historical"</strong> (or biographical) approach, which argues that <strong>"context is essential"</strong>. This view requires examining the <strong>"author's life"</strong> and the <strong>"social"</strong> and <strong>"political"</strong> conditions of the <strong>"time"</strong> the work was created, seeing the text as a <strong>"product"</strong> of that context.</li>
                             </ul>
                         </li>
                     </ul>
                 `,
                  quiz: {
                     question: "According to Text A (Formalist critique), what is considered 'irrelevant' for understanding a poem?",
                     options: [
                         "The poem's structure and meter.",
                         "The choice of words used in the poem.",
                         "The author's life and historical period.",
                         "The emotional connection created by the poem."
                     ],
                     correctAnswerIndex: 2
                 }
             },
             {
                 textA: {
                     redacted: "<strong>Standardized tests</strong> <code>&nbsp;&nbsp;&nbsp;</code> as a vital <strong>tool</strong> for <strong>measuring</strong> <strong>student</strong> achievement and school performance <code>&nbsp;&nbsp;&nbsp;</code> large populations. They provide an <strong>objective</strong> and <code>&nbsp;&nbsp;&nbsp;</code> <strong>benchmark</strong>, <code>&nbsp;&nbsp;&nbsp;</code> <strong>schools</strong>, districts, and even states to be <strong>compared</strong> <code>&nbsp;&nbsp;&nbsp;</code> a single, potentially <strong>fair</strong> <strong>standard</strong>, <code>&nbsp;&nbsp;&nbsp;</code> the test is well-designed.<br><br>This large-scale <strong>data</strong> is <code>&nbsp;&nbsp;&nbsp;</code> for <code>&nbsp;&nbsp;&nbsp;</code> <strong>policymakers</strong> and administrators to <strong>identify</strong> broad trends, <code>&nbsp;&nbsp;&nbsp;</code> gaps, and systemic <strong>problems</strong> at a <code>&nbsp;&nbsp;&nbsp;</code> or national <strong>level</strong>. It allows them to <code>&nbsp;&nbsp;&nbsp;</code> <strong>resources</strong> more <strong>effectively</strong> towards areas <code>&nbsp;&nbsp;&nbsp;</code> improvement. Without such comparable <strong>data</strong>, large-scale educational <strong>accountability</strong> and reform become <code>&nbsp;&nbsp;&nbsp;</code> more <strong>difficult</strong>.<br><br><code>&nbsp;&nbsp;&nbsp;</code>, these tests can <code>&nbsp;&nbsp;&nbsp;</code> schools and teachers to focus on <code>&nbsp;&nbsp;&nbsp;</code> academic subjects and ensure a baseline <code>&nbsp;&nbsp;&nbsp;</code> of knowledge is being <code>&nbsp;&nbsp;&nbsp;</code> to all students.",
                     full: "Standardized tests serve as a vital tool for measuring student achievement and school performance across large populations. They provide an objective and consistent benchmark, allowing schools, districts, and even states to be compared using a single, potentially fair standard, assuming the test is well-designed.\n\nThis large-scale data is crucial for allowing policymakers and administrators to identify broad trends, achievement gaps, and systemic problems at a regional or national level. It allows them to allocate resources more effectively towards areas needing improvement. Without such comparable data, large-scale educational accountability and reform become significantly more difficult.\n\nFurthermore, these tests can motivate schools and teachers to focus on core academic subjects and ensure a baseline level of knowledge is being imparted to all students."
                 },
                 textB: {
                      redacted: "<strong>Critics</strong>, <strong>however</strong>, <code>&nbsp;&nbsp;&nbsp;</code> that the <code>&nbsp;&nbsp;&nbsp;</code> reliance on <strong>standardized tests</strong> forces educators to <strong>measure</strong> only a <strong>narrow</strong> <code>&nbsp;&nbsp;&nbsp;</code> of easily <code>&nbsp;&nbsp;&nbsp;</code> <strong>skills</strong>, often <code>&nbsp;&nbsp;&nbsp;</code> crucial areas. These tests <code>&nbsp;&nbsp;&nbsp;</code> <strong>fail</strong> to <code>&nbsp;&nbsp;&nbsp;</code> important qualities like <strong>creativity</strong>, <strong>critical thinking</strong>, collaboration, and complex problem-solving <strong>abilities</strong>, instead <code>&nbsp;&nbsp;&nbsp;</code> rote memorization and 'teaching to the test'.<br><br>A more <code>&nbsp;&nbsp;&nbsp;</code> <strong>assessment</strong>, such as a <strong>portfolio</strong>-based <strong>approach</strong> or project-based learning evaluations, provides a <code>&nbsp;&nbsp;&nbsp;</code>, more <strong>holistic</strong> view of a <strong>student</strong>'s capabilities and <code>&nbsp;&nbsp;&nbsp;</code>. <strong>Portfolios</strong>, for instance, can <code>&nbsp;&nbsp;&nbsp;</code> <strong>long-term growth</strong>, creativity, and <strong>deep understanding</strong> of complex subjects in ways a single high-stakes test <strong>cannot</strong> possibly <code>&nbsp;&nbsp;&nbsp;</code>.<br><br><code>&nbsp;&nbsp;&nbsp;</code> on test scores can also <code>&nbsp;&nbsp;&nbsp;</code> inequities, as scores often <code>&nbsp;&nbsp;&nbsp;</code> strongly with socioeconomic status, potentially <code>&nbsp;&nbsp;&nbsp;</code> schools and students in under-resourced communities.",
                      full: "Critics, however, argue that the heavy reliance on standardized tests forces educators to measure only a narrow range of easily quantifiable skills, often neglecting crucial areas. These tests frequently fail to capture important qualities like creativity, critical thinking, collaboration, and complex problem-solving abilities, instead promoting rote memorization and 'teaching to the test'.\n\nA more authentic assessment, such as a portfolio-based approach or project-based learning evaluations, provides a richer, more holistic view of a student's capabilities and progress. Portfolios, for instance, can showcase long-term growth, creativity, and deep understanding of complex subjects in ways a single high-stakes test cannot possibly capture.\n\nOveremphasis on test scores can also exacerbate inequities, as scores often correlate strongly with socioeconomic status, potentially penalizing schools and students in under-resourced communities."
                 },
                 explanation: `
                     <ul>
                         <li><strong>Similarity:</strong> Both texts discuss methods for <strong>measuring</strong> <strong>student</strong> achievement in <strong>schools</strong>, specifically addressing the role and impact of <strong>"standardized tests"</strong>.</li>
                         <li><strong>Difference:</strong> The texts present opposing views on the value and limitations of standardized tests.
                             <ul>
                                 <li>Text A argues *for* standardized tests, portraying them as a necessary <strong>"tool"</strong> providing an <strong>"objective benchmark"</strong> and <strong>"fair standard"</strong>. It highlights their usefulness for collecting <strong>"data"</strong> used by <strong>"policymakers"</strong> for <strong>"accountability"</strong> and resource allocation.</li>
                                 <li>Text B, introduced by <code>Critics, however...</code>, argues *against* relying heavily on standardized tests. It claims they <strong>"measure"</strong> only a <strong>"narrow"</strong> range of <strong>"skills"</strong>, <strong>"fail"</strong> to capture <strong>"creativity"</strong> and <strong>"critical thinking"</strong>, and <strong>"cannot"</strong> show <strong>"long-term growth"</strong>. It suggests alternatives like the <strong>"portfolio-based approach"</strong> offer a more <strong>"holistic"</strong> assessment.</li>
                             </ul>
                         </li>
                     </ul>
                 `,
                  quiz: {
                     question: "What alternative method of assessment does Text B propose in contrast to standardized tests?",
                     options: [
                         "Oral examinations",
                         "Group projects",
                         "Portfolio-based assessment",
                         "Teacher observations"
                     ],
                     correctAnswerIndex: 2
                 }
             },
             {
                 textA: {
                     redacted: "The <strong>'nature'</strong> <code>&nbsp;&nbsp;&nbsp;</code> within <strong>psychology</strong> <code>&nbsp;&nbsp;&nbsp;</code> that <strong>human behavior</strong>, personality, and <strong>intelligence</strong> are <code>&nbsp;&nbsp;&nbsp;</code> determined by <strong>genetics</strong> and <strong>biological</strong> factors. This <strong>perspective</strong> <code>&nbsp;&nbsp;&nbsp;</code> the significance of traits <strong>inherited</strong> from our <strong>parents</strong> and our <code>&nbsp;&nbsp;&nbsp;</code> biological <code>&nbsp;&nbsp;&nbsp;</code>.<br><br><code>&nbsp;&nbsp;&nbsp;</code> supporting this view often comes from <strong>twin studies</strong>, <code>&nbsp;&nbsp;&nbsp;</code> those involving identical twins <code>&nbsp;&nbsp;&nbsp;</code> apart in <code>&nbsp;&nbsp;&nbsp;</code> environments. The <code>&nbsp;&nbsp;&nbsp;</code> similarities <code>&nbsp;&nbsp;&nbsp;</code> in such twins, <code>&nbsp;&nbsp;&nbsp;</code> different upbringings, suggest that many complex <strong>traits</strong> like cognitive ability and personality tendencies are strongly <code>&nbsp;&nbsp;&nbsp;</code> by our <strong>genes</strong>.<br><br><code>&nbsp;&nbsp;&nbsp;</code> psychology also <code>&nbsp;&nbsp;&nbsp;</code> with this view, suggesting that many behaviors are <code>&nbsp;&nbsp;&nbsp;</code> shaped by natural selection over <code>&nbsp;&nbsp;&nbsp;</code>, hardwired into our biology.",
                     full: "The 'nature' viewpoint within psychology posits that human behavior, personality, and intelligence are largely determined by genetics and biological factors. This perspective emphasizes the significance of traits inherited from our parents and our innate biological predispositions.\n\nEvidence supporting this view often comes from twin studies, particularly those involving identical twins raised apart in different environments. The striking similarities observed in such twins, despite different upbringings, suggest that many complex traits like cognitive ability and personality tendencies are strongly influenced by our genes.\n\nEvolutionary psychology also aligns with this view, suggesting that many behaviors are adaptations shaped by natural selection over generations, hardwired into our biology."
                 },
                 textB: {
                     redacted: "<strong>On the other hand</strong>, the <strong>'nurture'</strong> <code>&nbsp;&nbsp;&nbsp;</code> <code>&nbsp;&nbsp;&nbsp;</code> the critical influence of our <strong>environment</strong> and <strong>experiences</strong>. This <strong>perspective</strong> holds that <strong>human behavior</strong>, beliefs, and skills are <code>&nbsp;&nbsp;&nbsp;</code> <strong>learned</strong> <code>&nbsp;&nbsp;&nbsp;</code> interactions with the <code>&nbsp;&nbsp;&nbsp;</code>, including <strong>upbringing</strong>, <strong>culture</strong>, <code>&nbsp;&nbsp;&nbsp;</code> relationships, and formal <strong>education</strong>.<br><br><code>&nbsp;&nbsp;&nbsp;</code>, while <strong>genetics</strong> might <code>&nbsp;&nbsp;&nbsp;</code> a basic <strong>foundation</strong> or predisposition, it is our <strong>environment</strong>—<code>&nbsp;&nbsp;&nbsp;</code> our crucial <strong>childhood</strong> <strong>experiences</strong>, socioeconomic status, and ongoing <strong>social</strong> interactions—that truly <strong>shapes</strong> who we <strong>become</strong> and how we behave.<br><br><code>&nbsp;&nbsp;&nbsp;</code>, for example, is a psychological school of thought <code>&nbsp;&nbsp;&nbsp;</code> emphasizing learned responses to environmental <code>&nbsp;&nbsp;&nbsp;</code>, minimizing the role of innate factors.",
                     full: "On the other hand, the 'nurture' perspective highlights the critical influence of our environment and experiences. This perspective holds that human behavior, beliefs, and skills are primarily learned through interactions with the world, including upbringing, culture, peer relationships, and formal education.\n\nEssentially, while genetics might provide a basic foundation or predisposition, it is our environment—including our crucial childhood experiences, socioeconomic status, and ongoing social interactions—that truly shapes who we become and how we behave.\n\nBehaviorism, for example, is a psychological school of thought heavily emphasizing learned responses to environmental stimuli, minimizing the role of innate factors."
                 },
                 explanation: `
                     <ul>
                         <li><strong>Similarity:</strong> Both texts explore fundamental questions in <strong>psychology</strong> concerning the origins of <strong>human behavior</strong>, personality, and <strong>intelligence</strong>.</li>
                         <li><strong>Difference:</strong> They represent the two opposing sides of the classic 'nature vs. nurture' debate.
                             <ul>
                                 <li>Text A argues for the <strong>"nature"</strong> perspective, emphasizing the primary <strong>role</strong> of <strong>"genetics"</strong>, <strong>"biological"</strong> factors, and <strong>"inherited"</strong> traits. It cites evidence from <strong>"twin studies"</strong>.</li>
                                 <li>Text B uses the signal phrase <code>On the other hand</code> to present the contrasting <strong>"nurture"</strong> perspective. It emphasizes the influence of the <strong>"environment"</strong>, including <strong>"experiences"</strong>, <strong>"upbringing"</strong>, <strong>"culture"</strong>, and <strong>"education"</strong>, arguing that behavior is primarily <strong>"learned"</strong> and <strong>"shapes"</strong> individuals.</li>
                             </ul>
                         </li>
                     </ul>
                 `,
                  quiz: {
                     question: "Text A attributes human traits primarily to 'nature'. What does Text B attribute them primarily to?",
                     options: [
                         "Random chance",
                         "Biological factors",
                         "Environmental influences ('nurture')",
                         "A mix of nature and nurture equally"
                     ],
                     correctAnswerIndex: 2
                 }
             },
              {
                 textA: {
                     redacted: "<strong>Robotic</strong> <strong>exploration</strong> offers significant <code>&nbsp;&nbsp;&nbsp;</code> for venturing into <strong>space</strong>, <code>&nbsp;&nbsp;&nbsp;</code> being vastly more <strong>efficient</strong> and <strong>cost-effective</strong> than human missions. <code>&nbsp;&nbsp;&nbsp;</code> like the Mars rovers or deep-space probes can operate <code>&nbsp;&nbsp;&nbsp;</code> for <strong>years</strong>, continuously collecting valuable scientific <strong>data</strong> at a <code>&nbsp;&nbsp;&nbsp;</code> of the <strong>cost</strong> <code>&nbsp;&nbsp;&nbsp;</code> to support a <strong>manned</strong> <strong>mission</strong> with life support and safety systems.<br><br><strong>Furthermore</strong>, sending <strong>robots</strong> eliminates the <code>&nbsp;&nbsp;&nbsp;</code> <strong>risk</strong> to <strong>human life</strong> <code>&nbsp;&nbsp;&nbsp;</code> with space travel. This makes them <code>&nbsp;&nbsp;&nbsp;</code> suited for exploring <strong>dangerous</strong> or unknown <code>&nbsp;&nbsp;&nbsp;</code>, like the surfaces of distant planets or the harsh radiation environments near gas giants. They can <code>&nbsp;&nbsp;&nbsp;</code> <strong>extreme</strong> temperatures and pressures that <strong>humans</strong> simply <strong>cannot</strong> <code>&nbsp;&nbsp;&nbsp;</code>.<br><br>The <code>&nbsp;&nbsp;&nbsp;</code> and resilience of robotic probes allow for <code>&nbsp;&nbsp;&nbsp;</code> observation and data gathering over extended <code>&nbsp;&nbsp;&nbsp;</code>, providing insights that brief human visits might miss.",
                     full: "Robotic exploration offers significant advantages for venturing into space, primarily being vastly more efficient and cost-effective than human missions. Probes like the Mars rovers or deep-space probes can operate autonomously for years, continuously collecting valuable scientific data at a fraction of the cost required to support a manned mission with life support and safety systems.\n\nFurthermore, sending robots eliminates the inherent risk to human life associated with space travel. This makes them ideally suited for exploring dangerous or unknown environments, like the surfaces of distant planets or the harsh radiation environments near gas giants. They can withstand extreme temperatures and pressures that humans simply cannot survive.\n\nThe longevity and resilience of robotic probes allow for sustained observation and data gathering over extended periods, providing insights that brief human visits might miss."
                 },
                 textB: {
                     redacted: "<strong>While</strong> <code>&nbsp;&nbsp;&nbsp;</code> the practical benefits of <strong>robotic</strong> <strong>missions</strong> like their <strong>efficiency</strong>, proponents of <strong>manned</strong> <strong>space</strong> <strong>exploration</strong> argue they <code>&nbsp;&nbsp;&nbsp;</code> the irreplaceable element of direct <strong>human</strong> experience and <code>&nbsp;&nbsp;&nbsp;</code>. Sending humans <code>&nbsp;&nbsp;&nbsp;</code> the <strong>public imagination</strong>, fosters international <code>&nbsp;&nbsp;&nbsp;</code>, and <strong>inspires</strong> future <strong>generations</strong> to pursue careers in <strong>science</strong> and engineering in a way robots alone cannot.<br><br><strong>Moreover</strong>, <strong>human astronauts</strong> possess adaptability and problem-solving skills <code>&nbsp;&nbsp;&nbsp;</code> for handling <strong>unexpected</strong> situations and making <code>&nbsp;&nbsp;&nbsp;</code> <strong>intuitive</strong> <strong>discoveries</strong> that pre-programmed <strong>robots</strong> <strong>could</strong> miss. The capacity for <code>&nbsp;&nbsp;&nbsp;</code> observation and complex decision-making remains uniquely <strong>human</strong>. The intrinsic <strong>human</strong> <code>&nbsp;&nbsp;&nbsp;</code> for <strong>exploration</strong> and discovery represents a profound <strong>value</strong> that transcends <code>&nbsp;&nbsp;&nbsp;</code> practical considerations of <strong>cost</strong>.<br><br><code>&nbsp;&nbsp;&nbsp;</code> a human presence beyond Earth also <code>&nbsp;&nbsp;&nbsp;</code> long-term species survival goals and opens <code>&nbsp;&nbsp;&nbsp;</code> for resource utilization and settlement <code>&nbsp;&nbsp;&nbsp;</code> with robots alone.",
                     full: "While acknowledging the practical benefits of robotic missions like their efficiency, proponents of manned space exploration argue they lack the irreplaceable element of direct human experience and discovery. Sending humans captures the public imagination, fosters international collaboration, and inspires future generations to pursue careers in science and engineering in a way robots alone cannot.\n\nMoreover, human astronauts possess adaptability and problem-solving skills crucial for handling unexpected situations and making on-the-spot intuitive discoveries that pre-programmed robots could miss. The capacity for nuanced observation and complex decision-making remains uniquely human. The intrinsic human drive for exploration and discovery represents a profound value that transcends purely practical considerations of cost.\n\nEstablishing a human presence beyond Earth also addresses long-term species survival goals and opens possibilities for resource utilization and settlement unthinkable with robots alone."
                 },
                 explanation: `
                     <ul>
                         <li><strong>Similarity:</strong> Both texts discuss <strong>space exploration</strong> and weigh the merits of using <strong>robots</strong> versus sending <strong>humans</strong> (<strong>manned</strong> missions).</li>
                         <li><strong>Difference:</strong> They prioritize different values and emphasize different advantages.
                             <ul>
                                 <li>Text A argues strongly *for* <strong>"robotic"</strong> exploration, emphasizing its practical benefits: being more <strong>"efficient"</strong>, <strong>"cost-effective"</strong>, having <strong>"no risk to human life"</strong>, and suitability for <strong>"dangerous"</strong> environments or long missions collecting <strong>"data"</strong>.</li>
                                 <li>Text B, starting with the signal word <code>While</code> to concede the point about efficiency, argues *for* <strong>"manned"</strong> (human) exploration. It emphasizes the less tangible but important benefits: the value of <strong>"human discovery"</strong>, capturing <strong>"public imagination"</strong>, its power to <strong>"inspire generations"</strong>, and the unique ability of <strong>"human astronauts"</strong> to solve <strong>"unexpected problems"</strong> and make <strong>"intuitive discoveries"</strong>. It frames exploration as a <strong>"value beyond cost"</strong>.</li>
                             </ul>
                         </li>
                          <li><strong>Signal Words:</strong> Text A uses <code>Furthermore</code> to add the safety argument for robots. Text B uses <code>While</code> to acknowledge robot efficiency before pivoting, and <code>Moreover</code> to add the argument about human adaptability.</li>
                     </ul>
                 `,
                  quiz: {
                     question: "Text B acknowledges that robotic missions are efficient. What main advantage does it argue manned missions have?",
                     options: [
                         "They are cheaper in the long run.",
                         "They can collect more data.",
                         "They inspire the public and allow for human discovery.",
                         "They are safer for the equipment involved."
                     ],
                     correctAnswerIndex: 2
                 }
             },
             {
                 textA: {
                     redacted: "The concept of '<strong>art</strong> for <strong>art's sake</strong>' <code>&nbsp;&nbsp;&nbsp;</code> that the primary <strong>value</strong> of an artwork lies <code>&nbsp;&nbsp;&nbsp;</code> in its intrinsic <strong>aesthetic</strong> qualities – its form, <code>&nbsp;&nbsp;&nbsp;</code>, and ability to evoke an <strong>emotional</strong> response. <code>&nbsp;&nbsp;&nbsp;</code> to this view, a <strong>painting</strong>, sculpture, or piece of music does not <strong>need</strong> an external justification or <code>&nbsp;&nbsp;&nbsp;</code> <strong>purpose</strong>, like teaching a moral lesson or <code>&nbsp;&nbsp;&nbsp;</code> a political agenda. Its <strong>value</strong> is self-contained.<br><br>This perspective <code>&nbsp;&nbsp;&nbsp;</code> the autonomy of <strong>art</strong>, <code>&nbsp;&nbsp;&nbsp;</code> it from the everyday concerns of morality, utility, or politics. The focus is <code>&nbsp;&nbsp;&nbsp;</code> on the sensory and <strong>emotional</strong> <strong>connection</strong> <code>&nbsp;&nbsp;&nbsp;</code> between the <strong>artist's</strong> <strong>expression</strong> and the viewer's perception, an experience that <code>&nbsp;&nbsp;&nbsp;</code> rational explanation or <strong>language</strong>. The ultimate <strong>purpose</strong> of <strong>art</strong>, in this sense, is <code>&nbsp;&nbsp;&nbsp;</code> to be <strong>art</strong> <strong>itself</strong>.<br><br><code>&nbsp;&nbsp;&nbsp;</code> movements like Aestheticism in the 19th century strongly <code>&nbsp;&nbsp;&nbsp;</code> for this view, <code>&nbsp;&nbsp;&nbsp;</code> against the perceived <code>&nbsp;&nbsp;&nbsp;</code> or utilitarianism in earlier art forms.",
                     full: "The concept of 'art for art's sake' posits that the primary value of an artwork lies solely in its intrinsic aesthetic qualities – its form, beauty, and ability to evoke an emotional response. According to this view, a painting, sculpture, or piece of music does not need an external justification or practical purpose, like teaching a moral lesson or serving a political agenda. Its value is self-contained.\n\nThis perspective champions the autonomy of art, separating it from the everyday concerns of morality, utility, or politics. The focus is purely on the sensory and emotional connection fostered between the artist's expression and the viewer's perception, an experience that transcends rational explanation or language. The ultimate purpose of art, in this sense, is simply to be art itself.\n\nArtistic movements like Aestheticism in the 19th century strongly advocated for this view, reacting against the perceived didacticism or utilitarianism in earlier art forms."
                 },
                 textB: {
                     redacted: "<code>&nbsp;&nbsp;&nbsp;</code>, many argue that this '<strong>art</strong> for <strong>art's sake</strong>' <strong>view</strong> is <code>&nbsp;&nbsp;&nbsp;</code> naive or ignores the historical reality. <code>&nbsp;&nbsp;&nbsp;</code> history, <strong>art</strong> has <code>&nbsp;&nbsp;&nbsp;</code> served as a crucial <strong>functional tool</strong> for communicating ideas, driving <strong>social commentary</strong>, fostering religious devotion, or <code>&nbsp;&nbsp;&nbsp;</code> political <strong>change</strong>. From ancient cave paintings <code>&nbsp;&nbsp;&nbsp;</code> hunts to modern protest murals <code>&nbsp;&nbsp;&nbsp;</code> <strong>injustice</strong>, <strong>art</strong> often acts as a <strong>powerful</strong> cultural <strong>weapon</strong> or mirror.<br><br>Its <strong>purpose</strong>, therefore, extends <code>&nbsp;&nbsp;&nbsp;</code> beyond the purely <strong>aesthetic</strong>; it is often deeply <code>&nbsp;&nbsp;&nbsp;</code> with the <strong>political</strong>, <strong>social</strong>, and ethical concerns of its time. <code>&nbsp;&nbsp;&nbsp;</code> this type of <strong>art</strong> <code>&nbsp;&nbsp;&nbsp;</code> <strong>societies</strong> to <code>&nbsp;&nbsp;&nbsp;</code> <strong>uncomfortable</strong> <strong>truths</strong>, question authority, and collectively <code>&nbsp;&nbsp;&nbsp;</code> for a <strong>better</strong> <strong>future</strong> or preserve cultural memory.<br><br>To <code>&nbsp;&nbsp;&nbsp;</code> this functional dimension is to <code>&nbsp;&nbsp;&nbsp;</code> a significant aspect of art's power and influence <code>&nbsp;&nbsp;&nbsp;</code> human history.",
                     full: "Conversely, many argue that this 'art for art's sake' view is historically naive or ignores the historical reality. Throughout history, art has frequently served as a crucial functional tool for communicating ideas, driving social commentary, fostering religious devotion, or enacting political change. From ancient cave paintings depicting hunts to modern protest murals highlighting injustice, art often acts as a powerful cultural weapon or mirror.\n\nIts purpose, therefore, extends far beyond the purely aesthetic; it is often deeply intertwined with the political, social, and ethical concerns of its time. Engaging with this type of art forces societies to confront uncomfortable truths, question authority, and collectively strive for a better future or preserve cultural memory.\n\nTo ignore this functional dimension is to overlook a significant aspect of art's power and influence throughout human history."
                 },
                 explanation: `
                     <ul>
                         <li><strong>Similarity:</strong> Both texts discuss the fundamental <strong>purpose</strong> and <strong>value</strong> of <strong>art</strong>.</li>
                         <li><strong>Difference:</strong> They present fundamentally opposing views on *what* that purpose is.
                             <ul>
                                 <li>Text A describes the '<strong>art for art's sake</strong>' philosophy, arguing that art's <strong>value</strong> is purely intrinsic, residing in its <strong>"aesthetic"</strong> and <strong>"emotional"</strong> qualities. It states art does not <strong>"need"</strong> an external <strong>"purpose"</strong> and should be <strong>"separate"</strong> from politics or utility.</li>
                                 <li>Text B explicitly rejects this view as <strong>"limited"</strong>. It argues that <strong>art</strong> historically serves as a <strong>"functional tool"</strong> for <strong>"social commentary"</strong>, political <strong>"change"</strong>, and exposing <strong>"injustice"</strong>. It states the purpose is <strong>"not just aesthetic, but also political and social"</strong>, acting as a <strong>"weapon"</strong> or forcing confrontation with <strong>"uncomfortable truths"</strong>.</li>
                             </ul>
                         </li>
                         <li><strong>Signal Words:</strong> Text B uses <code>Conversely</code> to signal a direct opposition to Text A's idea and uses the structure <code>not just... but also...</code> to broaden the definition of art's purpose.</li>
                     </ul>
                 `,
                  quiz: {
                     question: "Text A argues art exists 'for art's sake'. What additional purpose does Text B argue art serves?",
                     options: [
                         "Purely entertainment",
                         "Historical documentation",
                         "Social and political commentary/change",
                         "Economic investment"
                     ],
                     correctAnswerIndex: 2
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