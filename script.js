// --- ANALYZER ELEMENTS ---
        const textInput = document.getElementById('text-input');
        const resultsContainer = document.getElementById('results-container');
        const analyzeBtn = document.getElementById('analyze-btn');
        const taskSelect = document.getElementById('task-select');

        // Conditional Input Elements
        const wordInputContainer = document.getElementById('word-input-container');
        const wordInput = document.getElementById('word-input');
        const sentenceInputContainer = document.getElementById('sentence-input-container');
        const sentenceInput = document.getElementById('sentence-input');
        const statementInputContainer = document.getElementById('statement-input-container');
        const statementInput = document.getElementById('statement-input');
        const paragraphInputContainer = document.getElementById('paragraph-input-container');
        const paragraphInput = document.getElementById('paragraph-input');
        const summaryLengthContainer = document.getElementById('summary-length-container');


        // --- ANALYZER STATE & LOGIC ---

        // State Variables
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

        // Restate Sentence Logic
        const restateTypes = [
            { id: 'passiveVoice', name: 'Using Passive Voice', prompt: "You are an expert linguist. Your task is to paraphrase a given sentence in English **using only the passive voice**. First, provide the rewritten sentence in English. Then, in a new paragraph labeled '*Penjelasan:*', explain in Indonesian exactly how the subject and object were swapped to create the passive voice." },
            { id: 'indirectSpeech', name: 'As Indirect Speech', prompt: "You are an expert linguist. Your task is to paraphrase a given sentence in English **as if it were being reported (indirect speech)**. First, provide the rewritten sentence in English. Then, in a new paragraph labeled '*Penjelasan:*', explain in Indonesian how the sentence was changed to reported speech, mentioning changes in tense or pronouns if applicable." },
            { id: 'swappingSynonyms', name: 'Swapping Synonyms', prompt: "You are an expert linguist. Your task is to paraphrase a given sentence in English **by swapping key words with appropriate synonyms**. First, provide the rewritten sentence in English. Then, in a new paragraph labeled '*Penjelasan:*', list in Indonesian the original words and the synonyms you used to replace them. For example: 'mengubah X menjadi Y, dan A menjadi B'." },
            { id: 'changingStructure', name: 'Changing Structure', prompt: "You are an expert linguist. Your task is to paraphrase a given sentence in English **by significantly changing the clause order or. overall sentence structure** while preserving the meaning. First, provide the rewritten sentence in English. Then, in a new paragraph labeled '*Penjelasan:*', describe in Indonesian how the sentence structure was altered, for example, by moving a subordinate clause to the beginning." }
        ];
        let restateUsageHistory = [];
        let restateTypeWeights = {};

        function initializeRestateWeights() {
            restateTypes.forEach(type => { restateTypeWeights[type.id] = 10; });
            restateUsageHistory = [];
        }
        function updateRestateWeights(usedTypeId) {
            restateUsageHistory.push(usedTypeId);
            if (restateUsageHistory.length >= restateTypes.length) { initializeRestateWeights(); return; }
            const UNUSED_WEIGHT = 10, BASE_USED_WEIGHT = 1;
            const historyReversed = [...restateUsageHistory].reverse();
            restateTypes.forEach(type => { const historyIndex = historyReversed.indexOf(type.id); restateTypeWeights[type.id] = (historyIndex === -1) ? UNUSED_WEIGHT : BASE_USED_WEIGHT + (2 * historyIndex); });
        }
        function selectRestateType() {
            const totalWeight = Object.values(restateTypeWeights).reduce((sum, weight) => sum + weight, 0);
            let random = Math.random() * totalWeight;
            for (const type of restateTypes) { random -= restateTypeWeights[type.id]; if (random <= 0) return type; }
            return restateTypes[0];
        }
        initializeRestateWeights();

        // System Prompts for AI Analysis
        const systemPrompts = {
            mainIdea: `You are an expert reading comprehension assistant. Your task is to identify the topic and main idea of the provided text.
    First, identify the single **Topic** of the text (1-3 words, in English).
    Then, generate 3-4 *different* paraphrased versions of the main idea. Each version must be accurate, have a different sentence structure, and use different synonyms where possible.

    For each version, you MUST follow this exact format, using Markdown for spacing:

    **Topic:**
    [State the single topic here, in English]

    **Main Idea:**
    [State the paraphrased main idea in a single, clear, and concise **English** sentence.]

    **Evidence:**
    "[The single, most representative sentence from the original text that best supports this main idea.]"

    **Penjelasan:**
    [Provide a **detailed** explanation in **Indonesian** for why this is the main idea, referencing the evidence sentence. When referring to specific words or short phrases from the original text within this explanation, please wrap them in \`<code>\` tags.]

    Separate each complete main idea block with '|||'. Do not add any other text, numbering, or bullet points. Avoid using asterisks for emphasis outside of the specified bold labels.
    `,
            inference: `You are a highly skilled critical thinking expert, a master of "reading between the lines". Your task is to find 3-4 *deep, logical inferences* from the provided text and present them as a JSON array. An inference is a logical conclusion based on evidence; it is **NOT** just a paraphrase of the quote. It is **NOT** something the text says directly. It is a logical leap. You MUST format your entire response as a single, valid JSON array. Do not include any text outside the array, including "json" or backticks. Each object in the array must have the following structure: { "quote": "The single, specific sentence or phrase from the original text (in English) that acts as the evidence.", "clue": "A short hint or 'clue' in **Indonesian** that points the user's attention to *why* the quote is important for making a logical leap. **If you mention specific words from the quote, keep those words in English and wrap them in single quotes.** (e.g., 'Perhatikan penggunaan kata 'suddenly' yang menyiratkan kejadian tak terduga.')", "inference": "The final logical conclusion (the implied meaning) in **English**. **This MUST be a new insight that is *implied* by the quote, not just a restatement of it.**", "explanation": "A detailed explanation in **Indonesian** that clearly connects the 'quote' and the 'clue' to the 'inference'. It must explain *how* you made the logical leap. When referring to specific words or short phrases from the original text within this explanation, please wrap them in \`<code>\` tags." } Ensure all strings are properly escaped within the JSON. Avoid using asterisks for emphasis outside of specified bold labels.`,
            trueFalse: `You are an expert reading comprehension and fact-checking assistant. Your task is to analyze the provided text and determine if the user's statement is True or False based *only* on the information given in the text. You MUST format your entire response as a single, valid JSON object. Do not include any text outside the object, including "json" or backticks. The JSON object must have the following structure: { "statement": "The user's statement that you evaluated (in English).", "result": "True" | "False", "quote": "The single, most relevant sentence or phrase from the original text (in English) that directly supports your True/False conclusion. If no single quote directly supports it (especially for False), briefly state why (e.g., 'Text does not mention this topic.')", "explanation": "A concise explanation in **Indonesian** clearly stating *why* the statement is True or False based on the provided quote or lack thereof in the text. When referring to specific words or short phrases from the original text within this explanation, please wrap them in \`<code>\` tags." } Ensure all strings are properly escaped within the JSON. Base your judgment solely on the provided text. Avoid using asterisks for emphasis outside of specified bold labels.`,
            summary: (length) => `You are an expert reading comprehension assistant. Your task is to create a concise summary of the provided text. The summary should capture the key points and be approximately ${length} sentence(s) long. Avoid using asterisks for emphasis.`,
            keyThemes: `You are an expert text analyst. Your task is to identify the 3-5 main recurring themes or key topics discussed in the provided text and present them as a JSON array. You MUST format your entire response as a single, valid JSON array. Do not include any text outside the array, including "json" or backticks. Each object in the array must have the following structure:
    {
      "theme": "The key theme or topic in English (e.g., 'Solar Power Advancements', 'Ethical AI Dilemmas').",
      "explanation": "A concise explanation in **Indonesian** describing what the text says about this theme. When referring to specific words or short phrases from the original text within this explanation, please wrap them in \`<code>\` tags."
    }
    Ensure all strings are properly escaped within the JSON.`,
            readabilityScore: `You are an expert readability analyst. Your task is to calculate the Flesch-Kincaid Reading Ease score for the provided text. Then, estimate the corresponding US Grade Level needed to understand the text. Finally, provide a detailed interpretation of the score in Indonesian, explaining *why* the text aligns with that grade level by considering factors like sentence structure (struktur kalimat), word choice/diction (pilihan kata/diksi), and the complexity of the subject matter or context (konteks dan subjek bahasan). When referring to specific words or short phrases from the original text within this explanation, please wrap them in \`<code>\` tags.

    Please format your response exactly like this:

    **Flesch-Kincaid Reading Ease:** [Score number]
    **Estimated Grade Level:** [Grade level, e.g., 8th Grade, College Graduate]
    **Penjelasan (Indonesian):** [Detailed interpretation in Indonesian covering sentence structure, diction, and context/subject matter.]

    Avoid using asterisks for emphasis outside of the specified bold labels.
    `,
            tone: `You are an expert literary analyst. Your task is to identify the tone of the provided text.
    First, state the primary tone in one or two words (e.g., 'Formal and Objective', 'Nostalgic and Melancholy').
    Then, add a line formatted exactly like this: **Evidence:** "[The single sentence or key phrase from the text that best exemplifies this tone.]"
    Finally, in a new paragraph, provide a brief explanation in Indonesian, referencing the evidence, to support your analysis. When referring to specific words or short phrases from the original text within this explanation, please wrap them in \`<code>\` tags. Avoid using asterisks for emphasis outside of the specified bold labels.`,
            purpose: `You are an expert rhetorical analyst.
    IF the user provides a "SPECIFIC PARAGRAPH TO ANALYZE": Your task is to determine the primary purpose *of that specific paragraph* within the context of the larger text. State whether the purpose is to inform, persuade, entertain, introduce, exemplify, transition, conclude, etc. Then, add a line formatted exactly like this: **Evidence:** "[The key sentence or phrase *from that paragraph* that best demonstrates its purpose.]" Finally, in a new paragraph, explain your reasoning in Indonesian using the evidence. When referring to specific words or short phrases from the original text within this explanation, please wrap them in \`<code>\` tags.
    IF NO specific paragraph is provided: Your task is to determine the primary purpose *of the entire provided text*. State whether the purpose is to inform, persuade, entertain, etc. Then, add a line formatted exactly like this: **Evidence:** "[The single sentence or key phrase *from the entire text* that best demonstrates its overall purpose.]" Finally, in a new paragraph, explain your reasoning in Indonesian using the evidence. When referring to specific words or short phrases from the original text within this explanation, please wrap them in \`<code>\` tags.

    Avoid using asterisks for emphasis outside of the specified bold labels.`,
            genre: "You are an expert in literary and textual genres. Your task is to identify the most likely genre of the provided text (e.g., 'News Report', 'Science Fiction Short Story', 'Personal Essay', 'Technical Manual'). In a new paragraph, briefly justify your choice based on the text's style, content, and structure. Provide the justification in Indonesian. Avoid using asterisks for emphasis.",
            wordMeaning: `You are an expert lexicographer and reading comprehension assistant. Your task is to analyze the provided text based on the user's request. You MUST format your entire response as a single, valid JSON array. Do not include any text outside the array, including "json" or backticks. IF THE USER PROVIDES A SPECIFIC "WORD TO ANALYZE": You must analyze **only that word**. The JSON array will contain a **single object** with this structure: { "word": "The specific word the user asked for (in English).", "definition": "A simple, dictionary-style definition of the word in **English**.", "quote": "The full sentence from the text where the word appears. You MUST indicate the word, for example by placing it in quotes: 'The quick \"brown\" fox...'.", "explanation": "A detailed contextual explanation in **Indonesian** of what the word means *specifically within the context of that quote*. When referring to specific words or short phrases from the original text within this explanation, please wrap them in \`<code>\` tags." } IF THE "WORD TO ANALYZE" IS EMPTY: You must scan the text and find the 3-5 most important or difficult **Key Vocabulary** words. The JSON array will contain **multiple objects** (one for each word) using the *exact same structure* as above. Ensure all strings are properly escaped within the JSON. Avoid using asterisks for emphasis outside of specified bold labels.`,
        };

        const resultTitles = {
            mainIdea: "Main Idea",
            summary: "Summary",
            keyThemes: "Key Themes",
            readabilityScore: "Readability Score",
            inference: "Inference",
            trueFalse: "True or False?",
            tone: "Author's Tone",
            purpose: "Author's Purpose",
            genre: "Text Genre",
            wordMeaning: "Word Meaning Analysis"
        };


        taskSelect.addEventListener('change', () => {
            const selectedTask = taskSelect.value;
            // Hide all conditional inputs first
            document.querySelectorAll('.conditional-input').forEach(el => el.classList.add('hidden'));
            // Show the relevant one based on the selected task
            if (selectedTask === 'summary') {
                summaryLengthContainer.classList.remove('hidden');
            } else if (selectedTask === 'wordMeaning') {
                wordInputContainer.classList.remove('hidden');
            } else if (selectedTask === 'restateSentence') {
                sentenceInputContainer.classList.remove('hidden');
            } else if (selectedTask === 'trueFalse') {
                statementInputContainer.classList.remove('hidden');
            } else if (selectedTask === 'purpose') {
                paragraphInputContainer.classList.remove('hidden');
            }
        });

        function setLoading(isLoading) {
            analyzeBtn.disabled = isLoading;
            if (isLoading) { resultsContainer.innerHTML = `<div id="loading-indicator" class="text-center p-6 bg-white rounded-xl shadow-md border-blue-200"><div class="flex justify-center items-center space-x-2"><div class="w-2 h-2 bg-blue-500 rounded-full animate-pulse" style="animation-delay: -0.3s;"></div><div class="w-2 h-2 bg-blue-500 rounded-full animate-pulse" style="animation-delay: -0.15s;"></div><div class="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div></div><p class="mt-3 text-gray-600 text-sm">Analyzing text...</p></div>`; }
            else { const loadingIndicator = document.getElementById('loading-indicator'); if (loadingIndicator) loadingIndicator.remove(); }
        }

        // Function to extract and format evidence quote
        function formatEvidenceQuote(rawContent) {
            // Match "Evidence:" case-insensitively, followed by optional spaces, and capture the quoted string
            const evidenceRegex = /\*\*Evidence:\*\*\s*"([^"]+)"/i;
            const match = rawContent.match(evidenceRegex);
            if (match && match[1]) {
                const quote = match[1].trim();
                // Remove the evidence line from the main content
                const contentWithoutEvidence = rawContent.replace(evidenceRegex, '').trim();
                const quoteHtml = `<div class="evidence-quote">"${quote}"</div>`;
                return { mainContent: contentWithoutEvidence, quoteHtml: quoteHtml };
            }
            return { mainContent: rawContent, quoteHtml: '' }; // No evidence found or format mismatch
        }

        // Function to apply final HTML formatting (bold, italics, code)
        function applyFinalFormatting(text) {
             if (typeof text !== 'string') return 'Error: Invalid content format';
             return text
                 .replace(/\n{2,}/g, '<br><br>') // Replace 2 or more newlines with a paragraph break
                 .replace(/\n/g, '<br>')      // Replace single newlines with a line break
                 .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') // Bold
                 .replace(/\*(.*?)\*/g, '<em>$1</em>')         // Italics
                 .replace(/`([^`]+)`/g, '<code>$1</code>');     // Code/Highlight
        }


        function displayResult(title, content, options = {}) {
            resultsContainer.innerHTML = '';
            const card = document.createElement('div');
            card.className = 'result-card bg-white p-6 rounded-2xl shadow-lg border border-blue-200';
            let formattedContent = "", isFallback = options?.isFallback, resultTitle = title, evidenceHtml = '';

            if (title === "Summary" && options.summaryLength) { resultTitle = `Summary (${options.summaryLength})`; }
            else if (title === "Author's Purpose" && options.analyzedParagraph) { resultTitle = `Purpose of Paragraph`; formattedContent += `<p class="mb-4 text-sm text-gray-500 italic">Analysis focuses on the specific paragraph you provided.</p>`; }
            else if (title === "Author's Purpose") { resultTitle = `Author's Purpose (Overall)`; formattedContent += `<p class="mb-4 text-sm text-gray-500 italic">Analysis focuses on the purpose of the entire text.</p>`; }

            if ((title.startsWith("Key Vocabulary") || title === "Word Meaning Analysis") && typeof content === 'object' && content !== null && !isFallback) {
                const quotedWordRegex = /"([^"]+)"/; const wordMatch = content.quote.match(quotedWordRegex);
                let formattedQuote = content.quote;
                if (wordMatch && wordMatch[1] === content.word) { formattedQuote = content.quote.replace(quotedWordRegex, `<strong>"${content.word}"</strong>`); }
                else { formattedQuote = content.quote.replace(content.word, `<strong>${content.word}</strong>`); }
                const explanationHtml = applyFinalFormatting(content.explanation); // Apply formatting
                formattedContent += `<div class="space-y-4"><div><strong class="block text-gray-800">Word:</strong> <p class="mt-1 text-xl font-semibold text-blue-700">${content.word}</p></div><div><strong class="block text-gray-800">Definition:</strong> <p class="mt-1">${content.definition}</p></div><div><strong class="block text-gray-800">Quote from Text:</strong> <p class="mt-1 italic">${formattedQuote}</p></div><div><strong class="block text-gray-800">Contextual Explanation (Penjelasan Kontekstual):</strong> <p class="mt-1">${explanationHtml}</p></div></div>`;
            } else if (title.startsWith("Inference") && typeof content === 'object' && content !== null && !isFallback) {
                const explanationHtml = applyFinalFormatting(content.explanation); // Apply formatting
                const clueHtml = applyFinalFormatting(content.clue); // Apply formatting
                formattedContent += `<div class="space-y-4"><div><strong class="block text-gray-800">Quote from Text:</strong> <p class="mt-1 italic">"${content.quote}"</p></div><div><strong class="block text-gray-800">Clue (Petunjuk):</strong> <p class="mt-1">${clueHtml}</p></div><button id="show-inference-btn" class="mt-2 bg-blue-100 text-blue-700 font-semibold py-2 px-4 rounded-lg hover:bg-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition duration-200">Show Inference</button><div id="inference-reveal" class="hidden space-y-4 mt-4 pt-4 border-t border-gray-200"><div><strong class="block text-gray-800">Inference:</strong> <p class="mt-1 font-semibold text-blue-700">${content.inference}</p></div><div><strong class="block text-gray-800">Explanation (Penjelasan):</strong> <p class="mt-1">${explanationHtml}</p></div></div></div>`;
            } else if (title === "True or False?" && typeof content === 'object' && content !== null && !isFallback) {
                const resultClass = content.result === "True" ? "result-true" : "result-false";
                const explanationHtml = applyFinalFormatting(content.explanation); // Apply formatting
                formattedContent += `<div class="space-y-4"><div><strong class="block text-gray-800">Statement:</strong> <p class="mt-1 italic">"${content.statement}"</p></div><div><strong class="block text-gray-800">Result:</strong> <p class="mt-1 text-xl ${resultClass}">${content.result}</p></div><div><strong class="block text-gray-800">Evidence from Text:</strong> <p class="mt-1 italic evidence-quote">"${content.quote}"</p></div><div><strong class="block text-gray-800">Explanation (Penjelasan):</strong> <p class="mt-1">${explanationHtml}</p></div></div>`;
            } else if (title === "Key Themes") {
                if (Array.isArray(content) && content.length > 0 && typeof content[0] === 'object') {
                    // It's the new JSON format
                    let themesHtml = '<ul class="space-y-4">';
                    content.forEach(item => {
                        const theme = item.theme ? item.theme : 'No theme title';
                        const explanation = item.explanation ? applyFinalFormatting(item.explanation) : 'No explanation provided.';
                        themesHtml += `<li class="ml-4">
                                            <strong class="text-lg font-semibold text-blue-800">${theme}</strong>
                                            <p class="mt-1 ml-2 text-gray-700">${explanation}</p>
                                        </li>`;
                    });
                    themesHtml += '</ul>';
                    formattedContent += `<div id="key-themes-list">${themesHtml}</div>`;
                } else {
                    // Fallback for old string format or error
                    let themesHtml = applyFinalFormatting(content); // Apply formatting
                    themesHtml = themesHtml.replace(/<li>/g, '<li class="ml-4">'); // Add margin to list items
                    formattedContent += `<div id="key-themes-list"><ul>${themesHtml}</ul></div>`;
                }
            } else if (title === "Readability Score") {
                let score = 'N/A', grade = 'N/A', explanation = 'No explanation provided.';
                if (typeof content === 'string') {
                    const lines = content.split('\n'); let explanationLines = []; let explanationStarted = false;
                    lines.forEach(line => {
                        const scoreMatch = line.match(/\*\*Flesch-Kincaid Reading Ease:\*\*\s*([\d\.]+)/i);
                        const gradeMatch = line.match(/\*\*Estimated Grade Level:\*\*\s*(.+)/i);
                        const explanationMatch = line.match(/\*\*Penjelasan \(Indonesian\):\*\*(.*)/i);
                        if (scoreMatch) score = scoreMatch[1];
                        else if (gradeMatch) grade = gradeMatch[1].trim();
                        else if (explanationMatch) { explanationStarted = true; explanationLines.push(explanationMatch[1].trim()); }
                        else if (explanationStarted) explanationLines.push(line.trim());
                    });
                    explanation = explanationLines.join('\n'); // Keep newlines for applyFinalFormatting
                    if (!explanation.trim()) explanation = 'No explanation provided.';
                    explanation = applyFinalFormatting(explanation); // Apply formatting to explanation
                }
                formattedContent += `<div class="space-y-3">
                                        <p><strong>Flesch-Kincaid Reading Ease:</strong> <span class="font-semibold text-blue-700">${score}</span></p>
                                        <p><strong>Estimated US Grade Level:</strong> <span class="font-semibold text-blue-700">${grade}</span></p>
                                        <p><strong>Penjelasan:</strong> ${explanation}</p>
                                    </div>`;
            } else { // Handle plain text results potentially containing evidence
                let processedResult = { mainContent: content, quoteHtml: '' };
                if (typeof content === 'string' && (title === "Main Idea" || title === "Author's Tone" || title === "Author's Purpose")) {
                    processedResult = formatEvidenceQuote(content);
                    evidenceHtml = processedResult.quoteHtml;
                }
                // Apply formatting LAST
                const finalContent = applyFinalFormatting(processedResult.mainContent);
                formattedContent += finalContent;
            }

            // Assemble card content, adding evidence at the end if present
            card.innerHTML = `<h2 class="text-2xl font-bold text-blue-700 mb-4">${resultTitle}</h2><div class="text-gray-700 leading-relaxed space-y-4">${formattedContent}</div>${evidenceHtml}`;


            const showInferenceBtn = card.querySelector('#show-inference-btn');
            if (showInferenceBtn) { showInferenceBtn.addEventListener('click', () => { const revealSection = card.querySelector('#inference-reveal'); if (revealSection) { revealSection.classList.remove('hidden'); showInferenceBtn.classList.add('hidden'); } }); }

            if (title === "Author's Tone") {
                const rewriteSection = document.createElement('div'); rewriteSection.className = 'mt-6 pt-6 border-t border-gray-200'; rewriteSection.innerHTML = `<h3 class="text-lg font-semibold text-gray-800 mb-3">Rewrite Text in a New Tone</h3><div class="space-y-3" id="rewrite-controls-container"><select id="card-tone-category-select" class="w-full p-2 border border-blue-300 rounded-lg bg-blue-100 text-gray-800"><option value="">-- Select Tone Category --</option><option value="positive">Positive</option><option value="negative">Negative</option><option value="neutral">Neutral</option><option value="custom">Custom</option></select><select id="card-positive-tones-select" class="hidden w-full p-2 border border-blue-300 rounded-lg bg-blue-100 text-gray-800"><option value="Joyful">Joyful</option><option value="Enthusiastic">Enthusiastic</option><option value="Hopeful">Hopeful</option><option value="Optimistic">Optimistic</option><option value="Friendly">Friendly</option></select><select id="card-negative-tones-select" class="hidden w-full p-2 border border-blue-300 rounded-lg bg-blue-100 text-gray-800"><option value="Sad">Sad</option><option value="Angry">Angry</option><option value="Critical">Critical</option><option value="Pessimistic">Pessimistic</option><option value="Skeptical">Skeptical</option></select><select id="card-neutral-tones-select" class="hidden w-full p-2 border border-blue-300 rounded-lg bg-blue-100 text-gray-800"><option value="Formal">Formal</option><option value="Objective">Objective</option><option value="Informative">Informative</option><option value="Analytical">Analytical</option><option value="Neutral">Neutral</option></select><div id="card-custom-tone-input-container" class="hidden"><label for="card-tone-rewrite-input" class="block text-sm font-medium text-gray-600 mb-1">Enter custom tone:</label><input type="text" id="card-tone-rewrite-input" class="w-full p-2 border border-blue-300 rounded-lg bg-blue-100 text-gray-800 placeholder-gray-500" placeholder="e.g., sarcastic, whimsical"></div><button id="rewrite-tone-btn" class="w-full bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-transform duration-200 transform hover:scale-105">Rewrite Text</button></div><div id="rewrite-result-container" class="mt-4"></div>`; card.appendChild(rewriteSection);
                const categorySelect = card.querySelector('#card-tone-category-select'); const positiveSelect = card.querySelector('#card-positive-tones-select'); const negativeSelect = card.querySelector('#card-negative-tones-select'); const neutralSelect = card.querySelector('#card-neutral-tones-select'); const customInput = card.querySelector('#card-custom-tone-input-container'); const rewriteBtn = card.querySelector('#rewrite-tone-btn'); const rewriteResultContainer = card.querySelector('#rewrite-result-container');
                categorySelect.addEventListener('change', () => { const category = categorySelect.value; positiveSelect.classList.toggle('hidden', category !== 'positive'); negativeSelect.classList.toggle('hidden', category !== 'negative'); neutralSelect.classList.toggle('hidden', category !== 'neutral'); customInput.classList.toggle('hidden', category !== 'custom'); });
                rewriteBtn.addEventListener('click', async () => {
                    let desiredTone = ""; const category = categorySelect.value; if (category === 'positive') desiredTone = positiveSelect.value; else if (category === 'negative') desiredTone = negativeSelect.value; else if (category === 'neutral') desiredTone = neutralSelect.value; else if (category === 'custom') desiredTone = card.querySelector('#card-tone-rewrite-input').value.trim();
                    if (desiredTone && lastAnalyzedText) { rewriteResultContainer.innerHTML = `<div class="text-center p-4 border rounded-lg bg-blue-50"><div class="flex justify-center items-center space-x-2"><div class="w-2 h-2 bg-blue-500 rounded-full animate-pulse" style="animation-delay: -0.3s;"></div><div class="w-2 h-2 bg-blue-500 rounded-full animate-pulse" style="animation-delay: -0.15s;"></div><div class="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div></div><p class="mt-3 text-gray-600 text-sm">Rewriting text...</p></div>`; rewriteBtn.disabled = true; const aiContent = await fetchToneRewrite(lastAnalyzedText, desiredTone); if (aiContent) { let formattedRewrite = applyFinalFormatting(aiContent).replace(/\[ORIGINAL\](.*?)\[\/ORIGINAL\]/g, '<span class="block mt-2"><span class="font-medium text-red-700">Original:</span> <span class="bg-red-100 text-red-900 p-1 rounded font-mono">"$1"</span></span>').replace(/\[MENJADI\](.*?)\[\/MENJADI\]/g, '<span class="block mb-2"><span class="font-medium text-green-700">Menjadi:</span> <span class="bg-green-100 text-green-900 p-1 rounded font-mono">"$1"</span></span>'); rewriteResultContainer.innerHTML = `<h4 class="text-md font-semibold text-blue-600 mb-2">Rewritten Text (Tone: ${desiredTone})</h4><div class="text-gray-700 leading-relaxed space-y-4 p-4 border rounded-lg bg-blue-50/50">${formattedRewrite}</div>`; } else { rewriteResultContainer.innerHTML = `<div class="bg-red-100 border border-red-200 text-red-700 p-3 rounded-lg" role="alert"><p>Error rewriting text.</p></div>`; } rewriteBtn.disabled = false; } else { rewriteResultContainer.innerHTML = `<p class="text-red-600 text-sm">Please select a tone.</p>`; }
                });
            }

            resultsContainer.appendChild(card);
        }

        function displayError(message) {
            resultsContainer.innerHTML = `<div class="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 rounded-lg" role="alert"><p class="font-bold">An error occurred</p><p>${message}</p></div>`;
        }


        async function fetchToneRewrite(text, desiredTone) {
            const apiKey = "AIzaSyCFx0aN9Z7UaZDbH1WxaT2ILQBSGO3uIAw"; const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;
            const systemPrompt = `You are an expert creative writer and editor. Your task is to rewrite the provided text to match a new, specified tone. Format response: **Rewritten Text** [Rewritten text] **Penjelasan Perubahan (Explanation of Changes)** [Explanation in Indonesian] **Perubahan Utama (Key Changes)** * [ORIGINAL]original[/ORIGINAL] * [MENJADI]rewritten[/MENJADI]. Avoid asterisks for emphasis.`;
            const userPrompt = `ORIGINAL TEXT: """${text}"""\n\nTARGET TONE: "${desiredTone}"`; const payload = { contents: [{ parts: [{ text: userPrompt }] }], systemInstruction: { parts: [{ text: systemPrompt }] }, generationConfig: { temperature: 0.0 } };
            let response; let retries = 0; const maxRetries = 3; let delay = 1000;
            while (retries < maxRetries) { try { response = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); if (response.ok) break; if (response.status === 429 || response.status >= 500) { await new Promise(resolve => setTimeout(resolve, delay)); delay *= 2; retries++; } else { throw new Error(`API Error: ${response.statusText} (${response.status})`); } } catch (error) { if (!error.message.startsWith('API Error')) { await new Promise(resolve => setTimeout(resolve, delay)); delay *= 2; retries++; } else { console.error("Non-retryable API error:", error); break; } } }
            if (!response || !response.ok) { console.error("Error calling Gemini API:", response ? `${response.status} ${response.statusText}` : "No response/network error"); return null; } try { const result = await response.json(); return result.candidates?.[0]?.content?.parts?.[0]?.text || null; } catch (error) { console.error("Error processing API response:", error); return null; }
        }

        async function getAIAnalysis(text, task, additionalInput = "") {
            setLoading(true);
            const apiKey = "AIzaSyCFx0aN9Z7UaZDbH1WxaT2ILQBSGO3uIAw"; const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;
            let systemPrompt, userPrompt = text, resultTitle, displayOptions = {};

            switch (task) {
                case 'restateSentence': const selectedType = selectRestateType(); systemPrompt = selectedType.prompt; userPrompt = `TEXT: """${text}"""\n\nSENTENCE TO RESTATE: "${additionalInput}"`; resultTitle = `Restated Sentence (${selectedType.name})`; updateRestateWeights(selectedType.id); break;
                case 'wordMeaning': systemPrompt = systemPrompts.wordMeaning; if (additionalInput) { userPrompt = `TEXT: """${text}"""\n\nWORD TO ANALYZE: "${additionalInput}"`; resultTitle = "Word Meaning Analysis"; } else { userPrompt = `TEXT: """${text}"""\n\nWORD TO ANALYZE: ""`; resultTitle = "Key Vocabulary"; } break;
                case 'trueFalse': systemPrompt = systemPrompts.trueFalse; userPrompt = `TEXT: """${text}"""\n\nSTATEMENT TO EVALUATE: "${additionalInput}"`; resultTitle = resultTitles.trueFalse; break;
                case 'purpose': systemPrompt = systemPrompts.purpose; resultTitle = resultTitles.purpose; if (additionalInput) { userPrompt = `FULL TEXT: """${text}"""\n\nSPECIFIC PARAGRAPH TO ANALYZE: """${additionalInput}"""`; displayOptions.analyzedParagraph = true; } else { userPrompt = `FULL TEXT: """${text}"""\n\nSPECIFIC PARAGRAPH TO ANALYZE: ""`; } break;
                case 'summary': let sentenceCount = 3, lengthLabel = "Medium"; if (additionalInput === 'short') { sentenceCount = 1; lengthLabel = "Short"; } else if (additionalInput === 'detailed') { sentenceCount = 5; lengthLabel = "Detailed"; } systemPrompt = systemPrompts.summary(sentenceCount); userPrompt = text; resultTitle = resultTitles.summary; displayOptions.summaryLength = lengthLabel; break;
                case 'keyThemes': systemPrompt = systemPrompts.keyThemes; userPrompt = text; resultTitle = resultTitles.keyThemes; break;
                case 'readabilityScore': systemPrompt = systemPrompts.readabilityScore; userPrompt = text; resultTitle = resultTitles.readabilityScore; break;
                default: systemPrompt = systemPrompts[task]; resultTitle = resultTitles[task]; userPrompt = text; break;
            }
            const payload = { contents: [{ parts: [{ text: userPrompt }] }], systemInstruction: { parts: [{ text: systemPrompt }] }, generationConfig: { temperature: 0.0, ...( (task === 'inference' || task === 'wordMeaning' || task === 'trueFalse' || task === 'keyThemes') && { responseMimeType: "application/json" } ) } };
            if (task === 'inference') payload.generationConfig.responseSchema = { type: "ARRAY", items: { type: "OBJECT", properties: { "quote": { "type": "STRING" }, "clue": { "type": "STRING" }, "inference": { "type": "STRING" }, "explanation": { "type": "STRING" } }, required: ["quote", "clue", "inference", "explanation"] } };
            else if (task === 'wordMeaning') payload.generationConfig.responseSchema = { type: "ARRAY", items: { type: "OBJECT", properties: { "word": { "type": "STRING" }, "definition": { "type": "STRING" }, "quote": { "type": "STRING" }, "explanation": { "type": "STRING" } }, required: ["word", "definition", "quote", "explanation"] } };
            else if (task === 'trueFalse') payload.generationConfig.responseSchema = { type: "OBJECT", properties: { "statement": { "type": "STRING" }, "result": { "type": "STRING", "enum": ["True", "False"] }, "quote": { "type": "STRING" }, "explanation": { "type": "STRING" } }, required: ["statement", "result", "quote", "explanation"] };
            else if (task === 'keyThemes') payload.generationConfig.responseSchema = { type: "ARRAY", items: { type: "OBJECT", properties: { "theme": { "type": "STRING" }, "explanation": { "type": "STRING" } }, required: ["theme", "explanation"] } };

            let response; let retries = 0; const maxRetries = 3; let delay = 1000;
            while (retries < maxRetries) { try { response = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); if (response.ok) break; if (response.status === 429 || response.status >= 500) { await new Promise(resolve => setTimeout(resolve, delay)); delay *= 2; retries++; } else { throw new Error(`API Error: ${response.statusText} (${response.status})`); } } catch (error) { if (error.message.startsWith('API Error')) { console.error("Non-retryable API error:", error); displayError(`Analysis failed: ${error.message}.`); setLoading(false); return; } await new Promise(resolve => setTimeout(resolve, delay)); delay *= 2; retries++; } }
            if (!response || !response.ok) { console.error("Error calling Gemini API:", response ? `${response.status} ${response.statusText}` : "No response/network error"); let errorMsg = "Analysis failed after multiple attempts."; if(response){ try { const errorBody = await response.json(); errorMsg = `API Error (${response.status}): ${errorBody?.error?.message || response.statusText}.`; } catch(e) { errorMsg = `API Error (${response.status}): ${response.statusText}.`; }} displayError(errorMsg); setLoading(false); return; }

            try {
                const result = await response.json();
                if (!result.candidates?.length || !result.candidates[0].content?.parts?.length) { let finishReason = result.candidates?.[0]?.finishReason; let safetyRatings = result.candidates?.[0]?.safetyRatings; console.warn("API returned no valid content.", finishReason, safetyRatings); let errorReason = "The AI response was empty."; if (finishReason === "SAFETY") errorReason = "Blocked due to safety concerns."; else if (finishReason === "RECITATION") errorReason = "Blocked due to recitation issues."; else if (finishReason) errorReason = `Stopped unexpectedly (${finishReason}).`; displayError(errorReason); setLoading(false); return; }
                const aiText = result.candidates[0].content.parts[0].text; if (!aiText) { throw new Error("AI returned empty response part."); }

                if (task === 'wordMeaning' || task === 'inference' || task === 'trueFalse' || task === 'keyThemes') {
                    let parsedData; let parseError = null;
                    try { parsedData = JSON.parse(aiText); if ((task === 'wordMeaning' || task === 'inference' || task === 'keyThemes') && (!Array.isArray(parsedData) || parsedData.length === 0)) throw new Error("Expected array."); if (task === 'trueFalse' && (typeof parsedData !== 'object' || parsedData === null)) throw new Error("Expected object."); }
                    catch (error) { console.error(`Failed JSON parse for '${task}':`, error, "\nRaw:", aiText); parseError = error; }
                    if (!parseError) {
                        if (task === 'wordMeaning') { vocabList = parsedData; lastAnalyzedTextForVocab = text; currentVocabIndex = 0; let title = vocabList.length > 1 ? `Key Vocabulary (${currentVocabIndex + 1} of ${vocabList.length})` : "Word Meaning Analysis"; displayResult(title, vocabList[0]); }
                        else if (task === 'inference') { inferenceList = parsedData; lastAnalyzedTextForInference = text; currentInferenceIndex = 0; const title = `Inference (${currentInferenceIndex + 1} of ${inferenceList.length})`; displayResult(title, inferenceList[0]); }
                        else if (task === 'keyThemes') { displayResult(resultTitle, parsedData, displayOptions); } // Pass the whole array to displayResult
                        else { displayResult(resultTitle, parsedData, displayOptions); }
                    } else { displayResult(resultTitles[task] || "Result", aiText, { isFallback: true }); }
                } else if (task === 'mainIdea') {
                    mainIdeaList = aiText.split('|||').map(item => item.trim()).filter(item => item !== ''); lastAnalyzedTextForMainIdea = text;
                    if (mainIdeaList.length > 0) { currentMainIdeaIndex = 0; displayResult(resultTitle, mainIdeaList[0], displayOptions); }
                    else { displayResult(resultTitle, "Could not find distinct main ideas.", displayOptions); }
                } else { displayResult(resultTitle, aiText, displayOptions); }
            } catch (error) { console.error("Error processing response:", error); displayError(`Issue processing response: ${error.message}.`);
            } finally { setLoading(false); }
        }

        analyzeBtn.addEventListener('click', () => {
            let task = taskSelect.value;
            const text = textInput.value.trim();
            if (!text) { displayError("Please paste text before analyzing."); return; }

            let additionalInput = ""; let shouldCycle = false;
            if (text === lastAnalyzedText) {
                if (task === 'mainIdea' && text === lastAnalyzedTextForMainIdea && mainIdeaList.length > 0) { currentMainIdeaIndex = (currentMainIdeaIndex + 1) % mainIdeaList.length; displayResult(`Main Idea`, mainIdeaList[currentMainIdeaIndex]); shouldCycle = true; }
                else if (task === 'inference' && text === lastAnalyzedTextForInference && inferenceList.length > 0) { currentInferenceIndex = (currentInferenceIndex + 1) % inferenceList.length; const title = `Inference (${currentInferenceIndex + 1} of ${inferenceList.length})`; displayResult(title, inferenceList[currentInferenceIndex], { isFallback: typeof inferenceList[currentInferenceIndex] === 'string' }); shouldCycle = true; }
                else if (task === 'wordMeaning' && text === lastAnalyzedTextForVocab) { additionalInput = wordInput.value.trim(); if(additionalInput === "" && vocabList.length > 0) { currentVocabIndex = (currentVocabIndex + 1) % vocabList.length; const title = `Key Vocabulary (${currentVocabIndex + 1} of ${vocabList.length})`; displayResult(title, vocabList[currentVocabIndex]); shouldCycle = true; } }
            }
            if (shouldCycle) return;

            lastAnalyzedText = text;
            if (task !== 'mainIdea' || text !== lastAnalyzedTextForMainIdea) mainIdeaList = [];
            if (task !== 'inference' || text !== lastAnalyzedTextForInference) inferenceList = [];
            if (task !== 'wordMeaning' || text !== lastAnalyzedTextForVocab || wordInput.value.trim() !== "") vocabList = [];
            if (task === 'mainIdea') lastAnalyzedTextForMainIdea = text;
            if (task === 'inference') lastAnalyzedTextForInference = text;
            if (task === 'wordMeaning' && wordInput.value.trim() === "") lastAnalyzedTextForVocab = text;

            additionalInput = "";
            switch (task) {
                case 'restateSentence': additionalInput = sentenceInput.value.trim(); if (!additionalInput) { displayError("Please enter sentence to restate."); return; } break;
                case 'wordMeaning': additionalInput = wordInput.value.trim(); break;
                case 'trueFalse': additionalInput = statementInput.value.trim(); if (!additionalInput) { displayError("Please enter statement to check."); return; } break;
                case 'purpose': additionalInput = paragraphInput.value.trim(); break;
                case 'summary': const selectedLengthRadio = summaryLengthContainer.querySelector('input[name="summaryLength"]:checked'); additionalInput = selectedLengthRadio ? selectedLengthRadio.value : 'medium'; break;
            }

            getAIAnalysis(text, task, additionalInput);
        });


        // --- TEXT DETECTIVE LOGIC ---

        // Text Detective Data
        const textPairs = [
            // Example 1: Photosynthesis vs. Respiration
            { 
                textA: { redacted: `<strong>Photosynthesis</strong> <code>is the</code> <code>process</code> <code>used by</code> <strong>plants</strong> <code>and other</code> <code>organisms</code> <code>to convert</code> <strong>light energy</strong> <code>into</code> <code>chemical</code> energy. <code>This</code> <code>process</code> <code>takes in</code> <strong>carbon dioxide</strong> <code>and</code> water, <code>and with</code> <code>the presence</code> of sunlight, <code>produces</code> <strong>glucose</strong> (<code>sugar</code>) <code>and</code> <strong>oxygen</strong>. <code>It</code> <code>occurs</code> in <code>chloroplasts</code> <code>and is</code> <code>an</code> <strong>anabolic</strong> <code>process,</code> <code>meaning</code> it <code>builds</code> complex <code>molecules.</code><br><br><code>Essentially,</code> <strong>plants</strong> <code>use</code> <code>this</code> <code>process</code> <code>to create</code> <code>their own</code> food, <code>which</code> <code>also</code> <code>releases</code> the <strong>oxygen</strong> <code>that</code> <code>most</code> living <code>things</code> <code>need</code> to survive.`, full: `Photosynthesis is the process used by plants and other organisms to convert light energy into chemical energy. This process takes in carbon dioxide and water, and with the presence of sunlight, produces glucose (sugar) and oxygen. It occurs in chloroplasts and is an anabolic process, meaning it builds complex molecules.\n\nEssentially, plants use this process to create their own food, which also releases the oxygen that most living things need to survive.` }, 
                textB: { redacted: `<strong>Cellular Respiration</strong>, <code>on the</code> <code>other</code> <code>hand,</code> <code>is the</code> <code>process</code> organisms <code>use to</code> <code>break down</code> <strong>glucose</strong> <code>to release</code> <code>chemical</code> <strong>energy</strong> <code>in the</code> <code>form of</code> <strong>ATP</strong>. <code>This</code> <code>process</code> <code>consumes</code> <strong>glucose</strong> <code>and</code> <strong>oxygen</strong>, <code>and</code> <code>releases</code> <strong>carbon dioxide</strong>, <code>water,</code> <code>and</code> energy. <code>It</code> <code>primarily</code> <code>occurs</code> in <code>mitochondria</code> <code>and is</code> a <strong>catabolic</strong> <code>process,</code> <code>meaning</code> it <code>breaks down</code> complex <code>molecules.</code><br><br><code>Essentially,</code> <code>this is</code> <code>how</code> <code>organisms</code> (<code>including</code> plants) <code>power</code> <code>their cells.</code> <code>It is</code> <code>almost</code> the <code>direct</code> <code>opposite</code> <code>of</code> photosynthesis.`, full: `Cellular Respiration, on the other hand, is the process organisms use to break down glucose to release chemical energy in the form of ATP. This process consumes glucose and oxygen, and releases carbon dioxide, water, and energy. It primarily occurs in mitochondria and is a catabolic process, meaning it breaks down complex molecules.\n\nEssentially, this is how organisms (including plants) power their cells. It is almost the direct opposite of photosynthesis.` }, 
                explanation: `<ul><li><strong>Similarity:</strong> Both texts describe fundamental <strong>energy processes</strong> in living organisms, involving <strong>glucose</strong>, <strong>oxygen</strong>, and <strong>carbon dioxide</strong>.</li><li><strong>Difference:</strong> Text A describes <strong>Photosynthesis</strong>, which <code>uses</code> <strong>light energy</strong>, <code>consumes</code> <strong>carbon dioxide</strong>, and <code>produces</code> <strong>glucose</strong> and <strong>oxygen</strong>. Text B describes <strong>Cellular Respiration</strong>, which <code>releases</code> <strong>chemical energy (ATP)</strong>, <code>consumes</code> <strong>glucose</strong> and <strong>oxygen</strong>, and <code>produces</code> <strong>carbon dioxide</strong>.</li><li><strong>Signal Words:</strong> Text B uses <code>on the other hand</code> and <code>opposite of</code> to highlight the contrast between the two processes.</li></ul>`, 
                quiz: { question: "What does Photosynthesis (Text A) produce, which is then used by Cellular Respiration (Text B)?", options: ["Carbon dioxide and water", "Glucose and oxygen", "Light energy and ATP", "Mitochondria and chloroplasts"], correctAnswerIndex: 1 } 
            },
            // Example 2: AR vs. VR
            { 
                textA: { redacted: `<strong>Augmented Reality</strong> (AR) <code>is a</code> <code>technology</code> that <strong>overlays</strong> <code>digital</code> <code>information</code> <code>onto the</code> <strong>real world</strong>. <code>It</code> <code>does not</code> <code>replace</code> the user's <code>environment</code> <code>but rather</code> <code>enhances</code> it <code>with</code> <code>computer-generated</code> <code>images,</code> <code>text,</code> <code>or data.</code> <code>A key</code> <code>feature</code> is <code>that the</code> <code>user</code> <code>remains</code> <code>fully</code> <code>aware</code> of their <code>physical</code> <code>surroundings.</code><br><br><code>Examples</code> <code>include</code> mobile <code>apps</code> <code>that let</code> <code>you</code> <code>see</code> <code>furniture</code> in your <code>room</code> <code>before</code> you buy <code>it,</code> <code>or</code> <code>heads-up</code> <code>displays</code> in <code>cars.</code> <code>AR</code> <code>systems</code> <code>typically</code> <code>use</code> <strong>smartphones</strong> <code>or</code> <strong>smart glasses</strong>.`, full: `Augmented Reality (AR) is a technology that overlays digital information onto the real world. It does not replace the user's environment but rather enhances it with computer-generated images, text, or data. A key feature is that the user remains fully aware of their physical surroundings.\n\nExamples include mobile apps that let you see furniture in your room before you buy it, or heads-up displays in cars. AR systems typically use smartphones or smart glasses.` }, 
                textB: { redacted: `<strong>Virtual Reality</strong> (VR), <code>in contrast,</code> <code>creates a</code> <code>fully</code> <strong>immersive</strong> <code>digital</code> <code>environment</code> that <strong>replaces</strong> <code>the user's</code> <strong>real-world</strong> <code>surroundings.</code> <code>When users</code> <code>put on</code> a <strong>VR headset</strong>, <code>they are</code> <code>transported</code> to a <code>completely</code> <code>different,</code> <code>simulated</code> <code>world.</code> <code>This</code> <code>technology</code> <code>aims</code> for <code>total</code> <code>immersion,</code> <code>blocking</code> out <code>the physical</code> <code>world</code> <code>to engage</code> the user's <code>senses.</code><br><br><code>It is</code> <code>commonly</code> <code>used for</code> <code>gaming,</code> <code>training</code> <code>simulations</code> (<code>like</code> flight <code>simulators</code>), <code>and</code> <code>virtual</code> <code>tours.</code> <code>It</code> <code>requires</code> a <strong>dedicated headset</strong> <code>that</code> <code>covers</code> the eyes.`, full: `Virtual Reality (VR), in contrast, creates a fully immersive digital environment that replaces the user's real-world surroundings. When users put on a VR headset, they are transported to a completely different, simulated world. This technology aims for total immersion, blocking out the physical world to engage the user's senses.\n\nIt is commonly used for gaming, training simulations (like flight simulators), and virtual tours. It requires a dedicated headset that covers the eyes.` }, 
                explanation: `<ul><li><strong>Similarity:</strong> Both texts describe <strong>immersive technologies</strong> that blend digital and physical experiences.</li><li><strong>Difference:</strong> Text A describes <strong>AR</strong>, which <code>overlays</code> digital content onto the <strong>real world</strong>, allowing the user to <code>still see</code> their surroundings. Text B describes <strong>VR</strong>, which <code>replaces</code> the <strong>real world</strong> with a <code>fully immersive</code> digital one, blocking out physical surroundings.</li><li><strong>Signal Words:</strong> Text B uses <code>in contrast</code> to establish the main difference from AR.</li></ul>`, 
                quiz: { question: "What is the main difference between AR and VR as described in the texts?", options: ["AR uses smart glasses, while VR uses smartphones.", "AR is for gaming, while VR is for shopping.", "AR replaces the real world, while VR enhances it.", "AR enhances the real world, while VR replaces it."], correctAnswerIndex: 3 } 
            },
            // Example 3: Introvert vs. Extrovert
            { 
                textA: { redacted: `<strong>Introversion</strong> <code>is a</code> <code>personality</code> <code>trait</code> <code>characterized</code> by a <code>focus on</code> <strong>internal feelings</strong> <code>and</code> <code>thoughts.</code> <code>Introverts</code> <code>tend to</code> <code>expend</code> energy <code>in social</code> <code>situations</code> <code>and</code> <code>regain</code> <code>it by</code> <code>spending</code> <strong>time alone</strong>. <code>They</code> <code>often</code> <code>prefer</code> <code>one-on-one</code> <code>conversations</code> <code>to</code> <code>large</code> <code>group</code> <code>gatherings</code> <code>and</code> <code>may be</code> <code>perceived</code> as <code>quiet</code> <code>or reflective.</code><br><br><code>This</code> <code>is not</code> <code>the same</code> as <code>shyness,</code> <code>which</code> <code>is</code> <code>anxiety</code> <code>about</code> <code>social</code> <code>interaction.</code> <code>Introversion</code> <code>is more</code> <code>about</code> <code>how</code> one <code>responds</code> <code>to</code> <code>social</code> <strong>stimulation</strong> <code>and</code> <code>where</code> <code>they</code> <code>draw</code> <code>their</code> <strong>energy</strong> <code>from.</code>`, full: `Introversion is a personality trait characterized by a focus on internal feelings and thoughts. Introverts tend to expend energy in social situations and regain it by spending time alone. They often prefer one-on-one conversations to large group gatherings and may be perceived as quiet or reflective.\n\nThis is not the same as shyness, which is anxiety about social interaction. Introversion is more about how one responds to social stimulation and where they draw their energy from.` }, 
                textB: { redacted: `<strong>Extroversion</strong>, <code>on the</code> <code>other</code> <code>hand,</code> <code>is</code> <code>characterized</code> by a <code>focus on</code> the <strong>outside world</strong>. <code>Extroverts</code> <code>tend to</code> <strong>gain energy</strong> <code>from</code> <strong>social interactions</strong>, <code>like</code> <code>parties</code> <code>or group</code> <code>discussions.</code> <code>They</code> <code>often</code> <code>feel</code> <code>drained</code> <code>by</code> <code>extended</code> <code>periods</code> <code>of solitude</code> <code>and</code> <code>may be</code> <code>perceived</code> as <code>outgoing,</code> <code>talkative,</code> <code>and</code> <code>enthusiastic.</code><br><br><code>They</code> <code>typically</code> <code>enjoy</code> <code>external</code> <strong>stimulation</strong> <code>and</code> <code>thrive</code> in <code>active,</code> <code>social</code> <code>environments.</code> <code>Like</code> <code>introversion,</code> <code>this is</code> a <code>core</code> <code>part of</code> <code>their</code> <code>personality</code> <code>and</code> <code>how they</code> <code>recharge.</code>`, full: `Extroversion, on the other hand, is characterized by a focus on the outside world. Extroverts tend to gain energy from social interactions, like parties or group discussions. They often feel drained by extended periods of solitude and may be perceived as outgoing, talkative, and enthusiastic.\n\nThey typically enjoy external stimulation and thrive in active, social environments. Like introversion, this is a core part of their personality and how they recharge.` }, 
                explanation: `<ul><li><strong>Similarity:</strong> Both texts describe <strong>personality traits</strong> related to social <strong>stimulation</strong> and <strong>energy</strong>.</li><li><strong>Difference:</strong> They describe opposite ways of regaining energy. Text A states <strong>Introverts</strong> <code>expend</code> energy in social settings and <code>regain</code> it from <strong>time alone</strong>. Text B states <strong>Extroverts</strong> <code>gain</code> energy from <strong>social interactions</strong> and feel <code>drained</code> by <strong>solitude</strong>.</li><li><strong>Signal Words:</strong> Text B uses <code>on the other hand</code> to signal the direct contrast with introversion.</li></ul>`, 
                quiz: { question: "According to the texts, what is the key difference between introversion and extroversion?", options: ["Introverts are shy, while extroverts are confident.", "Introverts prefer the outside world, while extroverts prefer internal feelings.", "How they gain or lose energy from social stimulation.", "Extroverts dislike being alone, while introverts dislike all social interaction."], correctAnswerIndex: 2 } 
            },
            // Example 4: Inflation vs. Deflation
            { 
                textA: { redacted: `<strong>Inflation</strong> <code>is an</code> <code>economic</code> <code>term</code> <code>that</code> <code>describes</code> the <code>general</code> <strong>increase</strong> <code>in the</code> <strong>price level</strong> <code>of</code> <code>goods</code> <code>and services</code> <code>over</code> <code>time.</code> <code>When</code> <code>inflation</code> <code>is high,</code> <code>the</code> <strong>purchasing power</strong> <code>of</code> <code>money</code> <strong>decreases</strong>; <code>in other</code> <code>words,</code> <code>each</code> <code>unit</code> <code>of</code> <code>currency</code> <code>buys</code> <code>fewer</code> <code>goods.</code> <code>Central</code> <code>banks</code> <code>often</code> <code>try to</code> <code>manage</code> <code>inflation</code> <code>to keep</code> <code>it at</code> a <code>low,</code> <code>stable</code> <code>rate.</code><br><br><code>Mild</code> <code>inflation</code> <code>is</code> <code>often</code> <code>considered</code> <code>normal</code> in a <code>growing</code> <code>economy,</code> <code>but</code> <code>hyperinflation</code> <code>can be</code> <code>devastating.</code>`, full: `Inflation is an economic term that describes the general increase in the price level of goods and services over time. When inflation is high, the purchasing power of money decreases; in other words, each unit of currency buys fewer goods. Central banks often try to manage inflation to keep it at a low, stable rate.\n\nMild inflation is often considered normal in a growing economy, but hyperinflation can be devastating.` }, 
                textB: { redacted: `<strong>Deflation</strong> <code>is the</code> <code>opposite,</code> <code>representing</code> a <code>general</code> <strong>decrease</strong> <code>in the</code> <strong>price level</strong>. <code>During</code> <code>deflation,</code> <code>the</code> <strong>purchasing power</strong> <code>of</code> <code>money</code> <strong>increases</strong>, <code>meaning</code> <code>the same</code> <code>amount</code> <code>of</code> <code>money</code> <code>can</code> <code>buy</code> <code>more</code> <code>goods</code> <code>and services.</code> <code>While</code> <code>this</code> <code>might</code> <code>sound</code> <code>good</code> <code>for consumers,</code> <code>it can</code> be <code>very</code> <code>harmful</code> <code>to an</code> <code>economy.</code><br><br><code>Falling</code> <code>prices</code> <code>can lead</code> <code>to</code> <code>reduced</code> <code>consumer</code> <code>spending</code> (<code>as people</code> <code>wait for</code> <code>prices</code> <code>to drop</code> <code>further</code>), <code>lower</code> <code>company</code> <code>profits,</code> <code>and</code> <code>higher</code> <code>unemployment.</code>`, full: `Deflation is the opposite, representing a general decrease in the price level. During deflation, the purchasing power of money increases, meaning the same amount of money can buy more goods and services. While this might sound good for consumers, it can be very harmful to an economy.\n\nFalling prices can lead to reduced consumer spending (as people wait for prices to drop further), lower company profits, and higher unemployment.` }, 
                explanation: `<ul><li><strong>Similarity:</strong> Both texts describe <strong>economic</strong> phenomena related to the <strong>price level</strong> of goods and the <strong>purchasing power</strong> of money.</li><li><strong>Difference:</strong> They are opposites. Text A defines <strong>Inflation</strong> as an <code>increase</code> in prices, which <code>decreases</code> purchasing power. Text B defines <strong>Deflation</strong> as a <code>decrease</code> in prices, which <code>increases</code> purchasing power, and notes its harmful effects on the economy.</li><li><strong>Signal Words:</strong> Text B uses <code>is the opposite</code> to create a clear contrast. Text A uses <code>in other words</code> to clarify a definition.</li></ul>`, 
                quiz: { question: "What do both texts describe, but in opposite ways?", options: ["The hiring of new employees.", "The decisions of central banks.", "The change in price levels and purchasing power.", "The increase in consumer spending."], correctAnswerIndex: 2 } 
            },
            // Example 5: Volcanoes vs. Earthquakes
            { 
                textA: { redacted: `A <strong>volcano</strong> <code>is a</code> <code>rupture</code> <code>in the</code> <code>Earth's</code> <code>crust</code> <code>that</code> <code>allows</code> <code>hot</code> <strong>magma</strong>, <code>volcanic</code> <code>ash,</code> <code>and</code> <code>gases</code> <code>to</code> <strong>escape</strong> <code>from a</code> <code>magma</code> <code>chamber</code> <code>below</code> <code>the surface.</code> <code>They</code> <code>typically</code> <code>occur</code> <code>at</code> <code>tectonic</code> <code>plate</code> <strong>boundaries</strong> (<code>both</code> <code>convergent</code> <code>and</code> <code>divergent</code>) <code>or</code> <code>over</code> <code>"hotspots."</code> <code>The</code> <code>eruption</code> <code>can be</code> <code>explosive</code> <code>or</code> <code>effusive</code> (<code>slow-flowing</code> <code>lava</code>).<br><br><code>Volcanoes</code> <code>can</code> <code>build</code> <code>mountains</code> <code>or islands</code> <code>over</code> <code>time.</code> <code>While</code> <code>destructive,</code> <code>their</code> <code>ash</code> <code>also</code> <code>creates</code> <code>very</code> <strong>fertile soil</strong>.`, full: `A volcano is a rupture in the Earth's crust that allows hot magma, volcanic ash, and gases to escape from a magma chamber below the surface. They typically occur at tectonic plate boundaries (both convergent and divergent) or over "hotspots." The eruption can be explosive or effusive (slow-flowing lava).\n\nVolcanoes can build mountains or islands over time. While destructive, their ash also creates very fertile soil.` }, 
                textB: { redacted: `An <strong>earthquake</strong> <code>is the</code> <code>sudden</code> <strong>shaking</strong> <code>of the</code> <code>Earth's</code> <code>surface</code> <code>caused by</code> <code>a rapid</code> <code>release</code> <code>of</code> <code>energy</code> <code>in the</code> <code>crust.</code> <code>This</code> <code>shaking</code> <code>originates</code> <code>from</code> <code>movements</code> <code>along</code> <code>fault</code> <code>lines,</code> <code>which</code> <code>are</code> <code>fractures</code> <code>in the</code> <code>rock.</code> <code>Like</code> <code>volcanoes,</code> <code>they</code> <code>are</code> <code>most</code> <code>common</code> <code>at</code> <code>tectonic</code> <code>plate</code> <strong>boundaries</strong>, <code>especially</code> <code>at</code> <code>transform</code> <code>boundaries</code> <code>where</code> <code>plates</code> <code>slide</code> <code>past</code> <code>each</code> <code>other.</code><br><br><code>The</code> <code>energy</code> <code>travels</code> <code>in</code> <code>waves,</code> <code>and</code> <code>the</code> <code>point</code> <code>directly</code> <code>above</code> <code>the</code> <code>origin</code> <code>is</code> <code>called</code> <code>the</code> <code>epicenter.</code> <code>Earthquakes</code> <code>do not</code> <code>create</code> <code>new</code> <code>land</code> <code>but</code> <code>can</code> <code>cause</code> <code>massive</code> <code>destruction</code> <code>in</code> <code>seconds.</code>`, full: `An earthquake is the sudden shaking of the Earth's surface caused by a rapid release of energy in the crust. This shaking originates from movements along fault lines, which are fractures in the rock. Like volcanoes, they are most common at tectonic plate boundaries, especially at transform boundaries where plates slide past each other.\n\nThe energy travels in waves, and the point directly above the origin is called the epicenter. Earthquakes do not create new land but can cause massive destruction in seconds.` }, 
                explanation: `<ul><li><strong>Similarity:</strong> Both texts describe <strong>geological events</strong> that <code>release energy</code> from the Earth's crust, often occurring at <strong>tectonic plate boundaries</strong>.</li><li><strong>Difference:</strong> Text A describes <strong>volcanoes</strong>, where <strong>magma</strong> <code>escapes</code> to the surface, often <code>building</code> land (mountains/islands) and creating <strong>fertile soil</strong>. Text B describes <strong>earthquakes</strong>, which are a <code>sudden shaking</code> from <code>fault line</code> movements and do not build new land.</li><li><strong>Signal Words:</strong> Text B uses <code>Like volcanoes</code> to draw a similarity in location (plate boundaries) before describing its different mechanism.</li></ul>`, 
                quiz: { question: "According to the texts, what is one major difference between volcanoes and earthquakes?", options: ["Only earthquakes happen at tectonic plate boundaries.", "Volcanoes release magma; earthquakes release energy from faults.", "Earthquakes create fertile soil, while volcanoes do not.", "Volcanoes are sudden; earthquakes are slow-flowing."], correctAnswerIndex: 1 } 
            },
            // Example 6: Poetry vs. Prose
            { 
                textA: { redacted: `<strong>Prose</strong> <code>is a</code> <code>form of</code> <strong>written language</strong> <code>that</code> <code>follows</code> <strong>natural</strong> <code>patterns</code> <code>of</code> <strong>speech</strong> <code>and</code> <code>grammatical</code> <code>structure.</code> <code>It is</code> <code>the</code> <code>most</code> <code>common</code> <code>form of</code> <code>writing,</code> <code>used in</code> <code>novels,</code> <code>short</code> <code>stories,</code> <code>articles,</code> <code>and</code> <code>essays.</code> <code>The</code> <code>language</code> <code>is</code> <code>typically</code> <code>straightforward,</code> <code>and</code> <code>its</code> <code>primary</code> <code>goal</code> <code>is</code> <code>often</code> <code>to</code> <code>communicate</code> <code>ideas,</code> <code>narrate</code> <code>events,</code> <code>or</code> <code>present</code> <code>information.</code><br><br><code>Prose</code> <code>is</code> <code>organized</code> <code>into</code> <strong>sentences</strong> <code>and</code> <strong>paragraphs</strong>. <code>While</code> <code>it can</code> <code>be</code> <code>artistic,</code> <code>it</code> <code>does not</code> <code>have</code> the <code>formal</code> <code>rhythmic</code> <code>structure</code> <code>of</code> <code>traditional</code> <code>poetry.</code>`, full: `Prose is a form of written language that follows natural patterns of speech and grammatical structure. It is the most common form of writing, used in novels, short stories, articles, and essays. The language is typically straightforward, and its primary goal is often to communicate ideas, narrate events, or present information.\n\nProse is organized into sentences and paragraphs. While it can be artistic, it does not have the formal rhythmic structure of traditional poetry.` }, 
                textB: { redacted: `<strong>Poetry</strong>, <code>in contrast,</code> <code>is a</code> <code>form of</code> <strong>written language</strong> <code>that</code> <code>emphasizes</code> <strong>rhythm</strong>, <strong>meter</strong>, <code>and</code> <code>aesthetic</code> <code>qualities</code> <code>of</code> <code>language.</code> <code>It</code> <code>often</code> <code>uses</code> <code>figurative</code> <code>language</code> (<code>like</code> <code>metaphors</code> <code>and</code> <code>similes</code>) <code>to</code> <code>evoke</code> <code>emotions</code> <code>and</code> <code>create</code> <code>imagery.</code> <code>Unlike</code> <code>prose,</code> <code>poetry</code> <code>is</code> <code>organized</code> <code>into</code> <strong>lines</strong> <code>and</code> <strong>stanzas</strong>.<br><br><code>The</code> <code>sound</code> <code>and</code> <code>rhythm</code> <code>of</code> <code>words</code> <code>are</code> <code>often</code> <code>just</code> <code>as</code> <code>important</code> <code>as</code> <code>their</code> <code>meaning.</code> <code>It</code> <code>is</code> <code>a</code> <code>more</code> <code>condensed</code> <code>form</code> <code>of</code> <code>expression,</code> <code>where</code> <code>every</code> <code>word</code> <code>is</code> <code>chosen</code> <code>for</code> <code>maximum</code> <code>impact.</code>`, full: `Poetry, in contrast, is a form of written language that emphasizes rhythm, meter, and aesthetic qualities of language. It often uses figurative language (like metaphors and similes) to evoke emotions and create imagery. Unlike prose, poetry is organized into lines and stanzas.\n\nThe sound and rhythm of words are often just as important as their meaning. It is a more condensed form of expression, where every word is chosen for maximum impact.` }, 
                explanation: `<ul><li><strong>Similarity:</strong> Both texts describe forms of <strong>written language</strong> used for expression.</li><li><strong>Difference:</strong> Text A describes <strong>Prose</strong>, which follows <code>natural speech</code> patterns and is organized into <code>sentences</code> and <code>paragraphs</code> (like novels, articles). Text B describes <strong>Poetry</strong>, which emphasizes <code>rhythm</code> and <code>meter</code>, uses condensed/figurative language, and is organized into <code>lines</code> and <code>stanzas</code>.</li><li><strong>Signal Words:</strong> Text B uses <code>in contrast</code> and <code>Unlike prose</code> to highlight the differences in structure and style.</li></ul>`, 
                quiz: { question: "What is the key structural difference between prose and poetry mentioned in the texts?", options: ["Prose uses sentences/paragraphs; poetry uses lines/stanzas.", "Prose evokes emotions; poetry presents information.", "Prose is common; poetry is rare.", "Prose uses metaphors; poetry does not."], correctAnswerIndex: 0 } 
            },
            // Example 7: Roman Republic vs. Empire
            { 
                textA: { redacted: `The <strong>Roman Republic</strong> (<code>509 BC</code> <code>- 27 BC</code>) <code>was</code> <code>a period</code> <code>of</code> <code>Roman</code> <code>civilization</code> <code>characterized</code> <code>by a</code> <strong>representative government</strong>. <code>Power</code> <code>was</code> <code>held</code> <code>by</code> <code>elected</code> <code>officials,</code> <code>primarily</code> <code>the</code> <strong>Senate</strong> <code>and</code> <code>two</code> <code>Consuls</code> <code>who</code> <code>were</code> <code>elected</code> <code>annually.</code> <code>This</code> <code>system</code> <code>was</code> <code>designed</code> <code>to prevent</code> <code>any</code> <code>one</code> <code>individual</code> <code>from</code> <code>gaining</code> <code>too much</code> <code>power.</code><br><br><code>During</code> <code>this</code> <code>time,</code> <code>Rome</code> <code>expanded</code> <code>significantly,</code> <code>conquering</code> <code>its</code> <code>neighbors</code> <code>in</code> <code>Italy</code> <code>and</code> <code>then</code> <code>expanding</code> <code>across</code> <code>the</code> <code>Mediterranean.</code> <code>However,</code> <code>internal</code> <code>strife,</code> <code>civil</code> <code>wars,</code> <code>and</code> <code>the</code> <code>rise</code> <code>of</code> <code>powerful</code> <code>generals</code> <code>eventually</code> <code>led</code> <code>to its</code> <code>collapse.</code>`, full: `The Roman Republic (509 BC - 27 BC) was a period of Roman civilization characterized by a representative government. Power was held by elected officials, primarily the Senate and two Consuls who were elected annually. This system was designed to prevent any one individual from gaining too much power.\n\nDuring this time, Rome expanded significantly, conquering its neighbors in Italy and then expanding across the Mediterranean. However, internal strife, civil wars, and the rise of powerful generals eventually led to its collapse.` }, 
                textB: { redacted: `The <strong>Roman Empire</strong> (<code>27 BC</code> <code>- 476 AD</code> <code>in the</code> <code>West</code>) <code>began</code> <code>when</code> <code>Augustus</code> <code>became</code> <code>the</code> <code>first</code> <strong>Emperor</strong>. <code>This</code> <code>new</code> <code>system</code> <strong>centralized power</strong> <code>in the</code> <code>hands</code> <code>of a</code> <strong>single ruler</strong>, <code>the</code> <strong>Emperor</strong>, <code>who</code> <code>held</code> <code>power</code> <code>for</code> <code>life.</code> <code>While</code> <code>the</code> <strong>Senate</strong> <code>still</code> <code>existed,</code> <code>its</code> <code>power</code> <code>was</code> <code>greatly</code> <code>diminished,</code> <code>and</code> <code>it</code> <code>largely</code> <code>served</code> <code>to</code> <code>legitimize</code> <code>the</code> <code>Emperor's</code> <code>decisions.</code><br><br><code>The</code> <code>Empire</code> <code>period</code> <code>is</code> <code>known</code> <code>for</code> <code>the</code> <code>"Pax</code> <code>Romana"</code> <code>(Roman</code> <code>Peace),</code> a <code>long</code> <code>period</code> <code>of</code> <code>relative</code> <code>stability</code> <code>and</code> <code>prosperity,</code> <code>as well</code> <code>as</code> <code>its</code> <code>vast</code> <code>territorial</code> <code>size</code> <code>and</code> <code>engineering</code> <code>marvels</code> <code>like</code> <code>aqueducts</code> <code>and</code> <code>roads.</code>`, full: `The Roman Empire (27 BC - 476 AD in the West) began when Augustus became the first Emperor. This new system centralized power in the hands of a single ruler, the Emperor, who held power for life. While the Senate still existed, its power was greatly diminished, and it largely served to legitimize the Emperor's decisions.\n\nThe Empire period is known for the "Pax Romana" (Roman Peace), a long period of relative stability and prosperity, as well as its vast territorial size and engineering marvels like aqueducts and roads.` }, 
                explanation: `<ul><li><strong>Similarity:</strong> Both texts describe <strong>periods of Roman civilization</strong> and mention the <strong>Senate</strong>.</li><li><strong>Difference:</strong> They describe different political systems. Text A outlines the <strong>Roman Republic</strong>, a <code>representative government</code> with <code>elected officials</code> (Consuls, Senate) sharing power. Text B describes the <strong>Roman Empire</strong>, where power was <code>centralized</code> in a <code>single ruler</code>, the <strong>Emperor</strong>, and the Senate had much less power.</li><li><strong>Signal Words:</strong> Text A uses <code>However</code> to describe the Republic's collapse. Text B uses <code>This new system</code> to introduce the Empire's structure as a change from the previous one.</li></ul>`, 
                quiz: { question: "What was the main change in government from the Republic (Text A) to the Empire (Text B)?", options: ["The Senate was created during the Empire.", "The Republic was ruled by a single Emperor.", "Power shifted from elected officials to a single Emperor.", "The Empire stopped expanding its territory."], correctAnswerIndex: 2 } 
            },
            // Example 8: Aerobic vs. Anaerobic
            { 
                textA: { redacted: `<strong>Aerobic exercise</strong> <code>involves</code> <code>physical</code> <code>activity</code> <code>of</code> <code>low to</code> <code>high</code> <code>intensity</code> <code>that</code> <code>depends</code> <code>on</code> <code>the</code> <strong>aerobic</strong> <code>energy-generating</code> <code>process.</code> "<code>Aerobic</code>" <code>means</code> "<code>with</code> <strong>oxygen</strong>," <code>so</code> <code>this</code> <code>type of</code> <code>exercise</code> <code>is</code> <code>fueled</code> <code>by</code> <code>a</code> <code>steady</code> <code>supply</code> <code>of</code> <strong>oxygen</strong> <code>to the</code> <code>muscles.</code> <code>It is</code> <code>typically</code> <code>performed</code> <code>at a</code> <code>moderate</code> <code>pace</code> <code>for a</code> <strong>sustained period</strong>.<br><br><code>Examples</code> <code>include</code> <code>long-distance</code> <strong>running</strong>, <strong>swimming</strong>, <code>cycling,</code> <code>and</code> <code>brisk</code> <code>walking.</code> <code>Its</code> <code>primary</code> <code>benefits</code> <code>include</code> <code>improved</code> <code>cardiovascular</code> <code>health</code> <code>and</code> <code>increased</code> <code>endurance.</code>`, full: `Aerobic exercise involves physical activity of low to high intensity that depends on the aerobic energy-generating process. "Aerobic" means "with oxygen," so this type of exercise is fueled by a steady supply of oxygen to the muscles. It is typically performed at a moderate pace for a sustained period.\n\nExamples include long-distance running, swimming, cycling, and brisk walking. Its primary benefits include improved cardiovascular health and increased endurance.` }, 
                textB: { redacted: `<strong>Anaerobic exercise</strong>, <code>conversely,</code> <code>involves</code> <code>short,</code> <strong>intense bursts</strong> <code>of</code> <code>activity.</code> "<code>Anaerobic</code>" <code>means</code> "<code>without</code> <strong>oxygen</strong>." <code>During</code> <code>these</code> <code>bursts,</code> <code>the</code> <code>body's</code> <code>demand</code> <code>for</code> <code>oxygen</code> <code>exceeds</code> <code>the</code> <code>supply,</code> <code>so</code> <code>it</code> <code>must</code> <code>rely on</code> <code>energy</code> <code>stored</code> <code>in the</code> <code>muscles</code> (<code>like</code> <code>glycogen</code>). <code>This</code> <code>energy</code> <code>source</code> <code>depletes</code> <code>quickly.</code><br><br><code>Examples</code> <code>include</code> <strong>sprinting</strong>, <strong>heavy weightlifting</strong>, <code>and</code> <code>high-intensity</code> <code>interval</code> <code>training</code> (HIIT). <code>This</code> <code>type of</code> <code>exercise</code> <code>is</code> <code>excellent</code> <code>for</code> <code>building</code> <code>muscle</code> <code>mass,</code> <code>power,</code> <code>and</code> <code>strength.</code>`, full: `Anaerobic exercise, conversely, involves short, intense bursts of activity. "Anaerobic" means "without oxygen." During these bursts, the body's demand for oxygen exceeds the supply, so it must rely on energy stored in the muscles (like glycogen). This energy source depletes quickly.\n\nExamples include sprinting, heavy weightlifting, and high-intensity interval training (HIIT). This type of exercise is excellent for building muscle mass, power, and strength.` }, 
                explanation: `<ul><li><strong>Similarity:</strong> Both texts describe types of <strong>physical exercise</strong> that use different energy systems in the body.</li><li><strong>Difference:</strong> Text A describes <strong>Aerobic</strong> exercise, which means "<code>with oxygen</code>," is done for a <code>sustained period</code> (like <strong>running</strong>), and builds <code>endurance</code>. Text B describes <strong>Anaerobic</strong> exercise, which means "<code>without oxygen</code>," is done in <code>intense bursts</code> (like <strong>sprinting</strong>), and builds <code>muscle mass</code> and <code>power</code>.</li><li><strong>Signal Words:</strong> Text B uses <code>conversely</code> to show the opposite nature of anaerobic exercise compared to aerobic.</li></ul>`, 
                quiz: { question: "Which activity is the best example of aerobic exercise as described in Text A?", options: ["Heavy weightlifting", "Sprinting", "Long-distance swimming", "A short burst of jumping"], correctAnswerIndex: 2 } 
            },
            // Example 9: Machine Learning vs. Deep Learning
            { 
                textA: { redacted: `<strong>Machine Learning</strong> (ML) <code>is a</code> <code>broad</code> <code>field of</code> <code>artificial</code> <code>intelligence</code> (AI) <code>where</code> <code>systems</code> <code>are</code> <code>trained</code> <code>to</code> <strong>learn from data</strong>. <code>Instead of</code> <code>being</code> <code>explicitly</code> <code>programmed</code> <code>with</code> <code>rules,</code> <code>an ML</code> <code>model</code> <code>identifies</code> <code>patterns</code> <code>in</code> <code>a</code> <strong>dataset</strong> <code>to make</code> <code>predictions</code> <code>or</code> <code>classifications.</code> <code>This</code> <code>can</code> <code>involve</code> <code>methods</code> <code>like</code> <code>regression</code> <code>or</code> <code>decision</code> <code>trees.</code><br><br><code>ML</code> <code>models</code> <code>often</code> <code>require</code> <strong>structured data</strong> <code>and</code> <code>significant</code> <code>"feature</code> <code>engineering"</code> – <code>where</code> <code>a human</code> <code>expert</code> <code>selects</code> <code>and</code> <code>optimizes</code> <code>the</code> <code>input</code> <code>variables</code> (<code>features</code>) <code>that</code> <code>the</code> <code>model</code> <code>should</code> <code>use</code> <code>to learn.</code>`, full: `Machine Learning (ML) is a broad field of artificial intelligence (AI) where systems are trained to learn from data. Instead of being explicitly programmed with rules, an ML model identifies patterns in a dataset to make predictions or classifications. This can involve methods like regression or decision trees.\n\nML models often require structured data and significant "feature engineering" – where a human expert selects and optimizes the input variables (features) that the model should use to learn.` }, 
                textB: { redacted: `<strong>Deep Learning</strong> (DL) <code>is a</code> <strong>specific subfield</strong> <code>of</code> <strong>Machine Learning</strong>. <code>It</code> <code>uses</code> <code>complex</code> <code>structures</code> <code>called</code> <strong>neural networks</strong>, <code>which</code> <code>are</code> <code>inspired</code> <code>by the</code> <code>human</code> <code>brain,</code> <code>with</code> <code>many</code> <code>layers.</code> <code>A key</code> <code>difference</code> <code>is</code> <code>that</code> <code>deep</code> <code>learning</code> <code>models</code> <code>can</code> <code>often</code> <code>learn</code> <code>from</code> <code>vast</code> <code>amounts</code> <code>of</code> <strong>unstructured data</strong> (<code>like</code> <code>images</code> <code>or raw</code> <code>text</code>).<br><br><code>Furthermore,</code> <code>DL</code> <code>excels</code> <code>at</code> <code>automatic</code> <code>"feature</code> <code>engineering,"</code> <code>meaning</code> <code>the</code> <strong>neural network</strong> <code>can</code> <code>learn</code> <code>the</code> <code>most</code> <code>important</code> <code>features</code> <code>directly</code> <code>from the</code> <strong>dataset</strong> <code>without</code> <code>human</code> <code>intervention.</code> <code>This</code> <code>makes</code> <code>it</code> <code>powerful</code> <code>for</code> <code>tasks</code> <code>like</code> <code>image</code> <code>recognition</code> <code>and</code> <code>natural</code> <code>language</code> <code>processing.</code>`, full: `Deep Learning (DL) is a specific subfield of Machine Learning. It uses complex structures called neural networks, which are inspired by the human brain, with many layers. A key difference is that deep learning models can often learn from vast amounts of unstructured data (like images or raw text).\n\nFurthermore, DL excels at automatic "feature engineering," meaning the neural network can learn the most important features directly from the dataset without human intervention. This makes it powerful for tasks like image recognition and natural language processing.` }, 
                explanation: `<ul><li><strong>Similarity:</strong> Both texts describe fields of AI focused on <strong>learning from data</strong> (datasets) rather than being explicitly programmed. Text B explicitly states DL is a <strong>subfield of Machine Learning</strong>.</li><li><strong>Difference:</strong> Text A describes <strong>Machine Learning</strong> (ML) as a <code>broad</code> field that often needs <code>structured data</code> and <code>human</code>-guided "feature engineering." Text B describes <strong>Deep Learning</strong> (DL) as a <code>specific subfield</code> using <strong>neural networks</strong> that can handle <code>unstructured data</code> (like images) and performs <code>automatic</code> feature engineering.</li><li><strong>Signal Words:</strong> Text B uses <code>is a specific subfield of</code> to show the relationship and <code>Furthermore</code> to add another key difference.</li></ul>`, 
                quiz: { question: "According to the texts, what is a key advantage of Deep Learning (Text B) over traditional Machine Learning (Text A)?", options: ["DL is a broader field than ML.", "DL requires humans to select features.", "DL can learn features automatically from data.", "DL only works with structured data."], correctAnswerIndex: 2 } 
            },
            // Example 10: Democracy vs. Monarchy
            { 
                textA: { redacted: `A <strong>Democracy</strong> <code>is a</code> <code>system</code> <code>of</code> <code>government</code> <code>where</code> <code>the</code> <code>ultimate</code> <strong>power</strong> (<code>sovereignty</code>) <code>is</code> <code>vested</code> <code>in the</code> <strong>people</strong>. <code>This</code> <code>power</code> <code>is</code> <code>typically</code> <code>exercised</code> <code>directly</code> <code>by them</code> (<code>direct</code> <code>democracy</code>) <code>or</code> <code>through</code> <strong>elected representatives</strong> (<code>representative</code> <code>democracy</code>). <code>Key</code> <code>features</code> <code>include</code> <code>free</code> <code>and</code> <code>fair</code> <strong>elections</strong>, <code>the</code> <code>protection</code> <code>of</code> <code>human</code> <code>rights,</code> <code>and</code> <code>the</code> <code>rule</code> <code>of</code> <code>law.</code><br><br><code>Leaders</code> <code>are</code> <code>accountable</code> <code>to the</code> <strong>people</strong>, <code>and</code> <code>their</code> <code>term</code> <code>in</code> <code>office</code> <code>is</code> <code>usually</code> <code>limited.</code> <code>The</code> <code>transition</code> <code>of</code> <code>power</code> <code>is</code> <code>determined</code> <code>by</code> <code>the</code> <code>outcome</code> <code>of</code> <strong>elections</strong>.`, full: `A Democracy is a system of government where the ultimate power (sovereignty) is vested in the people. This power is typically exercised directly by them (direct democracy) or through elected representatives (representative democracy). Key features include free and fair elections, the protection of human rights, and the rule of law.\n\nLeaders are accountable to the people, and their term in office is usually limited. The transition of power is determined by the outcome of elections.` }, 
                textB: { redacted: `A <strong>Monarchy</strong> <code>is a</code> <code>system</code> <code>of</code> <code>government</code> <code>where</code> <code>a</code> <strong>single person</strong>, <code>the</code> <strong>monarch</strong>, <code>holds</code> <code>sovereign</code> <strong>power</strong>. <code>The</code> <code>right</code> <code>to</code> <code>rule</code> <code>is</code> <code>typically</code> <strong>inherited</strong>, <code>passing</code> <code>down</code> <code>through</code> <code>a</code> <code>royal</code> <code>family</code> (<code>hereditary</code> <code>monarchy</code>). <code>In</code> <code>an</code> <strong>absolute</strong> <code>monarchy,</code> <code>the</code> <code>monarch's</code> <code>power</code> <code>is</code> <code>unlimited.</code><br><br><code>In contrast,</code> <code>a</code> <strong>constitutional</strong> <code>monarchy</code> (<code>like</code> <code>the</code> <code>UK</code>), <code>the</code> <strong>monarch</strong> <code>is a</code> <code>head</code> <code>of</code> <code>state</code> <code>with</code> <code>limited</code> <code>or</code> <code>ceremonial</code> <code>powers,</code> <code>while</code> <code>an</code> <code>elected</code> <code>body</code> <code>like</code> <code>a</code> <code>parliament</code> <code>holds</code> <code>the</code> <code>actual</code> <code>power</code> <code>to</code> <code>govern,</code> <code>making</code> <code>it</code> <code>similar</code> <code>in</code> <code>function</code> <code>to a</code> <code>democracy.</code>`, full: `A Monarchy is a system of government where a single person, the monarch, holds sovereign power. The right to rule is typically inherited, passing down through a royal family (hereditary monarchy). In an absolute monarchy, the monarch's power is unlimited.\n\nIn contrast, a constitutional monarchy (like the UK), the monarch is a head of state with limited or ceremonial powers, while an elected body like a parliament holds the actual power to govern, making it similar in function to a democracy.` }, 
                explanation: `<ul><li><strong>Similarity:</strong> Both texts describe <strong>systems of government</strong> that determine how <strong>power</strong> is held and exercised.</li><li><strong>Difference:</strong> Text A describes a <strong>Democracy</strong>, where power rests with the <strong>people</strong>, who choose leaders via <strong>elections</strong>. Text B describes a <strong>Monarchy</strong>, where power is held by a <strong>single monarch</strong>, and the position is usually <strong>inherited</strong>. Text B also introduces a hybrid, the <strong>constitutional</strong> monarchy.</li><li><strong>Signal Words:</strong> Text B uses <code>In contrast</code> to distinguish constitutional monarchies from absolute ones, and also implicitly contrasts the entire concept with democracy.</li></ul>`, 
                quiz: { question: "According to the texts, how is power transferred in a democracy versus a hereditary monarchy?", options: ["Democracy: inheritance / Monarchy: elections", "Democracy: elections / Monarchy: inheritance", "Both systems use elections.", "Both systems use inheritance."], correctAnswerIndex: 1 } 
            }
        ];

        // --- TEXT DETECTIVE STATE & ELEMENTS ---

        // State
        let isRevealed = false;
        let currentExampleIndex = 0;
        let currentDifficulty = 'moderate'; // Default difficulty for guided practice
        let quizSubmitted = false;
        // State for user text mode
        let userFullText = "";
        let userRedactedText = "";
        let userTextIsRevealed = false;
        let selectedUserDifficulty = null;
        let currentQuizCorrectIndex = 0; // Stores the correct index for the *shuffled* quiz


        // Tab Elements
        const tabAnalyzer = document.getElementById('tab-analyzer');
        const tabDetective = document.getElementById('tab-detective');
        const analyzerContainer = document.getElementById('analyzer-container');
        const detectiveContainer = document.getElementById('detective-container');

        // Detective Sub-Containers
        const detectiveModeSelect = document.getElementById('detective-mode-select');
        const difficultyContainer = document.getElementById('difficulty-container');
        const detectiveContent = document.getElementById('detective-content');
        const congratsContainer = document.getElementById('congrats-container');
        const userTextContainer = document.getElementById('user-text-container');

        // Mode Selection Buttons
        const modeGuidedBtn = document.getElementById('mode-guided-btn');
        const modeUserTextBtn = document.getElementById('mode-user-text-btn');
        
        // Guided Practice Elements
        const guidedBackBtn = document.getElementById('guided-back-btn');
        const guidedDoneBackBtn = document.getElementById('guided-done-back-btn');
        const revealBtn = document.getElementById('reveal-btn');
        const nextChallengeBtn = document.getElementById('next-challenge-btn');
        const restartDetectiveBtn = document.getElementById('restart-detective-btn');
        const textAContent = document.getElementById('text-a-content');
        const textBContent = document.getElementById('text-b-content');
        const explanationContainer = document.getElementById('explanation-container');
        const explanationContent = document.getElementById('explanation-content');
        
        // Quiz Elements
        const quizContainer = document.getElementById('quiz-container');
        const quizQuestion = document.getElementById('quiz-question');
        const quizOptions = document.getElementById('quiz-options');
        const submitQuizBtn = document.getElementById('submit-quiz-btn');
        const quizFeedback = document.getElementById('quiz-feedback');

        // User Text Mode Elements
        const userTextBackBtn = document.getElementById('user-text-back-btn');
        const userTextInputStep = document.getElementById('user-text-input-step');
        const userTextInput = document.getElementById('user-text-input');
        const userTextError = document.getElementById('user-text-error');
        const redactUserTextBtn = document.getElementById('redact-user-text-btn');
        const userDifficultyButtons = document.querySelectorAll('.user-difficulty-btn');
        const userTextResultStep = document.getElementById('user-text-result-step');
        const userTextRevealBtn = document.getElementById('user-text-reveal-btn');
        const userTextRedactedContent = document.getElementById('user-text-redacted-content');
        const userTextStartOverBtn = document.getElementById('user-text-start-over-btn');

        // List of common words to ignore during redaction
        const stopWords = new Set(['a', 'an', 'and', 'the', 'in', 'on', 'at', 'to', 'for', 'of', 'is', 'are', 'was', 'were', 'it', 'its', 'i', 'you', 'he', 'she', 'they', 'we', 'me', 'him', 'her', 'them', 'us', 'my', 'your', 'his', 'our', 'their', 'with', 'by', 'from', 'as', 'but', 'or', 'so', 'if', 'be', 'has', 'have', 'had', 'do', 'does', 'did', 'not', 'no', 'this', 'that', 'these', 'those', 'what', 'which', 'who', 'whom', 'when', 'where', 'why', 'how', 'all', 'any', 'some', 'many', 'more', 'most', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', '']);


        // --- TEXT DETECTIVE FUNCTIONS ---

        /**
         * Generates the redacted HTML for Guided Practice based on the chosen difficulty.
         */
        function generateRedactedHTML(baseRedactedHTML, difficulty) {
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = baseRedactedHTML;
            const codeElements = tempDiv.querySelectorAll('code');
            let revealChance = 0;

            switch (difficulty) {
                case 'beginner':
                    revealChance = 0.7; // Reveal 70% of redacted words
                    break;
                case 'moderate':
                    revealChance = 0.4; // Reveal 40%
                    break;
                case 'advanced':
                    revealChance = 0.1; // Reveal 10%
                    break;
                case 'expert':
                default:
                    revealChance = 0; // Reveal 0% (all <code> tags stay as blocks)
                    break;
            }

            if (revealChance > 0) {
                codeElements.forEach(el => {
                    if (Math.random() < revealChance) {
                        const span = document.createElement('span');
                        span.className = 'un-redacted';
                        span.textContent = el.textContent;
                        el.replaceWith(span);
                    }
                });
            }
            
            return tempDiv.innerHTML;
        }

        /**
         * Generates redacted HTML for the User Input Mode.
         */
        function redactUserText(text, difficulty) {
            const redactionRates = {
                beginner: 0.25, // Redact 25%
                moderate: 0.50, // Redact 50%
                advanced: 0.75, // Redact 75%
                expert: 0.90    // Redact 90%
            };
            const rate = redactionRates[difficulty] || 0.5; // Default to moderate
            
            // Preserve line breaks by replacing them with a unique marker, then split by space
            // This regex handles various line break scenarios and spaces
            const textWithBreaks = text.replace(/(\n\r?|\r\n?)/g, ' \n ');
            const words = textWithBreaks.split(/(\s+)/).filter(w => w.length > 0); // Split by whitespace, keep separators

            const redactedWords = words.map(word => {
                const trimmedWord = word.trim();
                if (trimmedWord === '') {
                    return word; // Preserve whitespace
                }
                if (trimmedWord === '\n') {
                    return '<br>'; // Convert newline marker to br
                }

                // Clean the word for checking
                const cleanedWord = trimmedWord.toLowerCase().replace(/[.,!?;:()"']/g, '');

                const isStopWord = stopWords.has(cleanedWord);
                const isTooShort = cleanedWord.length < 3;

                // Only redact if it's not a stop word, not too short, and passes the random check
                if (!isStopWord && !isTooShort && Math.random() < rate) {
                    // Re-attach punctuation if any, logic simplified for this example
                    return `<code>${word}</code>`;
                } else {
                    return word;
                }
            });

            // Join back
            return redactedWords.join('');
        }


        /**
         * Sets up the Guided Practice challenge for the given index and difficulty.
         */
        function setupDetectiveChallenge(index, difficulty) {
            currentExampleIndex = parseInt(index);
            currentDifficulty = difficulty; // Store for reveal toggle
            isRevealed = false; 
            quizSubmitted = false;

            const currentPair = textPairs[currentExampleIndex];
            
            // Generate and set the redacted text
            textAContent.innerHTML = generateRedactedHTML(currentPair.textA.redacted, difficulty);
            textBContent.innerHTML = generateRedactedHTML(currentPair.textB.redacted, difficulty);
            
            // Reset UI state
            revealBtn.textContent = 'Show Full Text'; 
            revealBtn.classList.add('hidden');
            nextChallengeBtn.classList.add('hidden');
            explanationContainer.classList.add('hidden'); 
            explanationContent.innerHTML = '';
            
            // Setup quiz
            populateQuiz(currentExampleIndex); 
            quizContainer.classList.remove('hidden'); 
            submitQuizBtn.disabled = true; // Enabled when an option is selected
            submitQuizBtn.classList.remove('hidden'); 
            quizFeedback.classList.add('hidden'); 
            quizFeedback.textContent = ''; 
            quizOptions.querySelectorAll('input').forEach(input => input.disabled = false);
        }

        /**
         * Populates the quiz container with the data for the current example.
         */
        function populateQuiz(index) {
            const quizData = textPairs[index].quiz; 
            quizQuestion.textContent = quizData.question; 
            quizOptions.innerHTML = '';
            
            // --- NEW SHUFFLE LOGIC ---
            const originalOptions = [...quizData.options];
            const originalCorrectIndex = quizData.correctAnswerIndex;
            const correctAnswerText = originalOptions[originalCorrectIndex];
            
            // Shuffle the options
            const shuffledOptions = originalOptions.sort(() => Math.random() - 0.5);

            // Find the new correct index after shuffling and store it
            currentQuizCorrectIndex = shuffledOptions.indexOf(correctAnswerText);
            // --- END NEW SHUFFLE LOGIC ---

            shuffledOptions.forEach((option, i) => { // Use shuffledOptions
                const optionId = `option-${i}`; 
                const div = document.createElement('div'); 
                div.className = 'quiz-option'; 
                div.innerHTML = `<input type="radio" name="quizAnswer" id="${optionId}" value="${i}" class="sr-only"><label for="${optionId}">${option}</label>`; 
                const radioInput = div.querySelector(`#${optionId}`); 
                
                // Add listener to enable submit button on selection
                radioInput.addEventListener('change', () => { 
                    submitQuizBtn.disabled = false; 
                }); 
                quizOptions.appendChild(div); 
            });
        }

        /**
         * Handles the quiz submission logic for Guided Practice.
         */
        function handleQuizSubmit() {
            const selectedOption = quizOptions.querySelector('input[name="quizAnswer"]:checked'); 
            if (!selectedOption) return;
            
            const selectedIndex = parseInt(selectedOption.value); 
            const correctIndex = currentQuizCorrectIndex; // Use the stored SHUFFLED index
            
            // Show feedback
            quizFeedback.classList.remove('hidden'); 
            if (selectedIndex === correctIndex) { 
                quizFeedback.textContent = 'Correct!'; 
                quizFeedback.className = 'feedback-correct'; 
            } else { 
                // Get the *original* correct answer text to display
                const originalCorrectIndex = textPairs[currentExampleIndex].quiz.correctAnswerIndex;
                const correctAnswerText = textPairs[currentExampleIndex].quiz.options[originalCorrectIndex];
                quizFeedback.textContent = `Incorrect. Correct answer: "${correctAnswerText}"`; 
                quizFeedback.className = 'feedback-incorrect'; 
            }
            quizFeedback.classList.add('p-3', 'rounded-lg', 'mt-4', 'font-medium', 'text-center'); 
            
            // Update UI
            submitQuizBtn.disabled = true; 
            submitQuizBtn.classList.add('hidden'); 
            quizOptions.querySelectorAll('input').forEach(input => input.disabled = true);
            
            // Show post-quiz buttons
            revealBtn.classList.remove('hidden');
            nextChallengeBtn.classList.remove('hidden');
            quizSubmitted = true;
        }

        /**
         * Toggles between the full text (with explanation) and the redacted text for Guided Practice.
         */
        function toggleReveal() {
            isRevealed = !isRevealed; 
            const currentPair = textPairs[currentExampleIndex];
            
            if (isRevealed) { 
                // Show Full Text
                textAContent.innerHTML = currentPair.textA.full.replace(/\n/g, '<br>'); 
                textBContent.innerHTML = currentPair.textB.full.replace(/\n/g, '<br>'); 
                revealBtn.textContent = 'Hide Full Text'; 
                explanationContent.innerHTML = currentPair.explanation; 
                explanationContainer.classList.remove('hidden'); 
            } else { 
                // Hide Full Text - Re-render the redacted text based on the stored difficulty
                textAContent.innerHTML = generateRedactedHTML(currentPair.textA.redacted, currentDifficulty);
                textBContent.innerHTML = generateRedactedHTML(currentPair.textB.redacted, currentDifficulty);
                revealBtn.textContent = 'Show Full Text'; 
                explanationContainer.classList.add('hidden'); 
                explanationContent.innerHTML = ''; 
            }
        }

        /**
         * Toggles between the full user text and the redacted user text.
         */
        function toggleUserTextReveal() {
             userTextIsRevealed = !userTextIsRevealed;
             if (userTextIsRevealed) {
                userTextRedactedContent.innerHTML = userFullText.replace(/\n/g, '<br>');
                userTextRevealBtn.textContent = 'Hide Full Text';
             } else {
                userTextRedactedContent.innerHTML = userRedactedText;
                userTextRevealBtn.textContent = 'Show Full Text';
             }
        }

        /**
         * Checks if the user text input is valid (length > 50) and a difficulty is selected.
         */
        function validateUserInput() {
            const wordCount = userTextInput.value.trim().split(/\s+/).filter(Boolean).length;
            let error = "";
            let valid = true;

            if (wordCount < 50) {
                error = `Please enter at least 50 words. (Current: ${wordCount})`;
                valid = false;
            } else if (!selectedUserDifficulty) {
                 error = 'Please select a redaction level.';
                 valid = false;
            }
            
            redactUserTextBtn.disabled = !valid;
            userTextError.textContent = error;
        }

        /**
         * Resets all detective sub-containers to a hidden state.
         */
        function hideAllDetectiveViews() {
            detectiveModeSelect.classList.add('hidden');
            difficultyContainer.classList.add('hidden');
            detectiveContent.classList.add('hidden');
            congratsContainer.classList.add('hidden');
            userTextContainer.classList.add('hidden');
        }


        // --- MAIN EVENT LISTENERS ---

        document.addEventListener('DOMContentLoaded', () => {
            // Set initial state for Analyzer tab
            taskSelect.dispatchEvent(new Event('change'));

            // Set initial state for Detective tab (show mode selection)
            hideAllDetectiveViews();
            detectiveModeSelect.classList.remove('hidden');
        });

        // --- Tab Listeners ---
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
            
            // Hide all sub-containers first
            hideAllDetectiveViews();
            
            // Show the mode select screen by default
            detectiveModeSelect.classList.remove('hidden');

            // Reset guided practice if user clicks away and comes back
            // This is a design choice, could be changed to preserve state
             if (!quizSubmitted && currentExampleIndex < textPairs.length) {
                 // If they were in the middle of a challenge, reset to mode select
             }

            tabDetective.classList.add('tab-active'); 
            tabDetective.classList.remove('tab-inactive'); 
            tabAnalyzer.classList.add('tab-inactive'); 
            tabAnalyzer.classList.remove('tab-active'); 
        });

        // --- Text Detective Mode Selection Listeners ---
        modeGuidedBtn.addEventListener('click', () => {
            hideAllDetectiveViews();
            // Check progress in guided mode
            if (currentExampleIndex >= textPairs.length) {
                // They finished, show congrats
                congratsContainer.classList.remove('hidden');
            } else if (quizSubmitted) {
                // If they are mid-challenge (just submitted quiz), show them their quiz result
                detectiveContent.classList.remove('hidden');
            } else {
                // Otherwise, show the difficulty selection for the current challenge
                difficultyContainer.classList.remove('hidden');
            }
        });

        modeUserTextBtn.addEventListener('click', () => {
            hideAllDetectiveViews();
            userTextContainer.classList.remove('hidden');
            
            // Reset to the input step
            userTextResultStep.classList.add('hidden');
            userTextInputStep.classList.remove('hidden');
            userTextInput.value = '';
            userTextError.textContent = '';
            redactUserTextBtn.disabled = true;
            selectedUserDifficulty = null;
            userDifficultyButtons.forEach(btn => btn.classList.remove('selected'));
            validateUserInput(); // Will set the initial error message
        });


        // --- Guided Practice Listeners ---
        document.querySelectorAll('.difficulty-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const difficulty = btn.dataset.difficulty;
                hideAllDetectiveViews();
                detectiveContent.classList.remove('hidden');
                // Setup the challenge for the current index and chosen difficulty
                setupDetectiveChallenge(currentExampleIndex, difficulty);
            });
        });
        
        guidedBackBtn.addEventListener('click', () => {
            hideAllDetectiveViews();
            detectiveModeSelect.classList.remove('hidden');
        });

        guidedDoneBackBtn.addEventListener('click', () => {
             hideAllDetectiveViews();
            detectiveModeSelect.classList.remove('hidden');
        });

        submitQuizBtn.addEventListener('click', handleQuizSubmit);
        revealBtn.addEventListener('click', toggleReveal); 

        nextChallengeBtn.addEventListener('click', () => {
            quizSubmitted = false; // Reset quiz state
            currentExampleIndex++;
            if (currentExampleIndex >= textPairs.length) {
                // Finished all challenges
                hideAllDetectiveViews();
                congratsContainer.classList.remove('hidden');
            } else {
                // Load next challenge - show difficulty screen first
                hideAllDetectiveViews();
                difficultyContainer.classList.remove('hidden');
            }
            // Reset reveal state for the new text
            isRevealed = false;
            revealBtn.textContent = 'Show Full Text';
        });

        restartDetectiveBtn.addEventListener('click', () => {
            currentExampleIndex = 0; // Reset progress
            quizSubmitted = false;
            hideAllDetectiveViews();
            difficultyContainer.classList.remove('hidden');
        });


        // --- User Text Mode Listeners ---
        userTextBackBtn.addEventListener('click', () => {
            hideAllDetectiveViews();
            detectiveModeSelect.classList.remove('hidden');
        });

        userTextInput.addEventListener('input', validateUserInput);

        userDifficultyButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                // Remove selected style from all
                userDifficultyButtons.forEach(b => b.classList.remove('selected'));
                // Add selected style to the clicked one
                btn.classList.add('selected');
                selectedUserDifficulty = btn.dataset.difficulty;
                validateUserInput();
            });
        });

        redactUserTextBtn.addEventListener('click', () => {
            if (redactUserTextBtn.disabled) return;

            userFullText = userTextInput.value;
            userRedactedText = redactUserText(userFullText, selectedUserDifficulty);
            
            userTextRedactedContent.innerHTML = userRedactedText;
            userTextIsRevealed = false;
            userTextRevealBtn.textContent = 'Show Full Text';

            // Switch views
            userTextInputStep.classList.add('hidden');
            userTextResultStep.classList.remove('hidden');
        });

        userTextRevealBtn.addEventListener('click', toggleUserTextReveal);

        userTextStartOverBtn.addEventListener('click', () => {
            // Reset to the input step
            userTextResultStep.classList.add('hidden');
            userTextInputStep.classList.remove('hidden');
            userTextInput.value = '';
            userTextError.textContent = '';
            redactUserTextBtn.disabled = true;
            selectedUserDifficulty = null;
            userDifficultyButtons.forEach(btn => btn.classList.remove('selected'));
            validateUserInput();
        });
