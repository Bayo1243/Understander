document.addEventListener('DOMContentLoaded', () => {

    // --- TAB ELEMENTS ---
    const tabAnalyzer = document.getElementById('tab-analyzer');
    const tabDetective = document.getElementById('tab-detective');
    const analyzerContainer = document.getElementById('analyzer-container');
    const detectiveContainer = document.getElementById('detective-container');

    // --- TAB LISTENERS ---
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

        tabDetective.classList.add('tab-active');
        tabDetective.classList.remove('tab-inactive');
        tabAnalyzer.classList.add('tab-inactive');
        tabAnalyzer.classList.remove('tab-active');
    });


    // --- ANALYZER LISTENERS ---
    if (taskSelect) {
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
    }

    if (analyzeBtn) {
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
    }


    // --- DETECTIVE MODE SELECTION LISTENERS ---
    if (modeGuidedBtn) {
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
    }

    if (modeUserTextBtn) {
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
    }


    // --- GUIDED PRACTICE LISTENERS ---
    document.querySelectorAll('.difficulty-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const difficulty = btn.dataset.difficulty;
            hideAllDetectiveViews();
            detectiveContent.classList.remove('hidden');
            // Setup the challenge for the current index and chosen difficulty
            setupDetectiveChallenge(currentExampleIndex, difficulty);
        });
    });
    
    if (guidedBackBtn) {
        guidedBackBtn.addEventListener('click', () => {
            hideAllDetectiveViews();
            detectiveModeSelect.classList.remove('hidden');
        });
    }

    if (guidedDoneBackBtn) {
        guidedDoneBackBtn.addEventListener('click', () => {
             hideAllDetectiveViews();
            detectiveModeSelect.classList.remove('hidden');
        });
    }

    if (submitQuizBtn) {
        submitQuizBtn.addEventListener('click', handleQuizSubmit);
    }

    if (revealBtn) {
        revealBtn.addEventListener('click', toggleReveal); 
    }

    if (nextChallengeBtn) {
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
    }

    if (restartDetectiveBtn) {
        restartDetectiveBtn.addEventListener('click', () => {
            currentExampleIndex = 0; // Reset progress
            quizSubmitted = false;
            hideAllDetectiveViews();
            difficultyContainer.classList.remove('hidden');
        });
    }


    // --- USER TEXT MODE LISTENERS ---
    if (userTextBackBtn) {
        userTextBackBtn.addEventListener('click', () => {
            hideAllDetectiveViews();
            detectiveModeSelect.classList.remove('hidden');
        });
    }

    if (userTextInput) {
        userTextInput.addEventListener('input', validateUserInput);
    }

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

    if (redactUserTextBtn) {
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
    }

    if (userTextRevealBtn) {
        userTextRevealBtn.addEventListener('click', toggleUserTextReveal);
    }

    if (userTextStartOverBtn) {
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
    }


    // --- INITIALIZATION ---
    if(taskSelect) {
        // Set initial state for Analyzer tab
        taskSelect.dispatchEvent(new Event('change'));
    }

    if(detectiveModeSelect) {
        // Set initial state for Detective tab (show mode selection)
        hideAllDetectiveViews();
        detectiveModeSelect.classList.remove('hidden');
    }

});
