/**
 * @file Text direction detection logic.
 */

// Unicode character ranges for RTL scripts
// Hebrew: U+0590 to U+05FF (though ֐-׿ is U+0590 - U+05FF)
const HEBREW_RANGES = [/\u0590-\u05FF/];
// Arabic: U+0600 to U+06FF, U+0750 to U+077F, U+08A0 to U+08FF, etc.
// Combining some common ranges for simplicity.
const ARABIC_RANGES = [/\u0600-\u06FF/, /\u0750-\u077F/, /\u08A0-\u08FF/, /\uFB50-\uFDFF/, /\uFE70-\uFEFF/];
// Other potential RTL scripts could be added here (Syriac, Thaana, N'Ko, etc.)

const RTL_RANGES = [...HEBREW_RANGES, ...ARABIC_RANGES];

/**
 * Checks if a character is an RTL character based on defined Unicode ranges.
 * @param {string} char The character to check.
 * @returns {boolean} True if the character is an RTL character, false otherwise.
 */
function isRtlChar(char) {
	if (!char || char.length !== 1) {
		return false;
	}
	for (const range of RTL_RANGES) {
		if (range.test(char)) {
			return true;
		}
	}
	return false;
}

/**
 * Determines the likely direction of a block of text.
 * @param {string} textBlock The text block to analyze.
 * @returns {'rtl' | 'ltr'} The detected direction.
 */
function getBlockDirection(textBlock) {
	if (!textBlock || typeof textBlock !== 'string') {
		return 'ltr'; // Default for empty or invalid input
	}

	let processedText = textBlock;

	// 0. Check for code blocks (```) - default to LTR
	if (processedText.startsWith('```')) {
		return 'ltr';
	}
	// Could add check for 4-space indented code blocks if a reliable way to get previous lines or full context was available.

	// 1. Remove leading markdown syntax
	// More comprehensive list, order matters.
	const markdownPrefixes = [
		/^\s*-\s*\[\s*[xX]?\s*\]\s*/, // Task list: - [ ], - [x], - [X]
		/^\s*[\-\*\+]\s+/,           // Unordered list: -, *, +
		/^\s*\d+[\.\)]\s+/,         // Ordered list: 1., 1)
		/^\s*#{1,6}\s+/,              // Headers: #, ##, ...
		/^\s*>{1,}\s*/,               // Blockquote: >, >>
		// Note: tables, thematic breaks (---, ***) are harder to handle line-by-line
	];
	for (const prefixRegex of markdownPrefixes) {
		processedText = processedText.replace(prefixRegex, '');
	}

	// 2. Trim leading/trailing whitespace again after prefix removal
	processedText = processedText.trim();

	// 3. Skip leading non-alphabetic characters (symbols, numbers, punctuation)
	//    to find the first character that might indicate script direction.
	let firstSignificantCharIndex = 0;
	for (let i = 0; i < processedText.length; i++) {
		const char = processedText[i];
		// This regex matches common punctuation, symbols, digits, and whitespace.
		// It's designed to stop at the first letter-like character from any script.
		if (/^[\s\d\p{P}\p{S}\p{Z}\p{C}]*$/u.test(char)) {
			firstSignificantCharIndex++;
		} else {
			break; // Found a potentially script-defining character
		}
	}
	processedText = processedText.substring(firstSignificantCharIndex);


	if (processedText.length === 0) {
		return 'ltr'; // Default for empty after all processing
	}

	// 4. "First Strong Character" heuristic
	// Iterate through the *processed* text to find the first strong directional char.
	// Check a reasonable length of the string for this.
	const checkLength = Math.min(processedText.length, 200);
	for (let i = 0; i < checkLength; i++) {
		const char = processedText[i];
		if (isRtlChar(char)) {
			return 'rtl'; // First strong RTL character found
		}
		// Basic Latin check (can be expanded to all LTR script blocks if needed for more accuracy)
		// Using \p{Script=Latin} or similar would be more robust if available and performant.
		if (/[a-zA-Z]/.test(char)) {
			return 'ltr'; // First strong LTR character found
		}
		// Characters that are neutral (spaces, numbers, common symbols) will be skipped
		// until a strong LTR or RTL character is encountered.
	}

	// 5. Fallback: Majority count (if no strong character was found early, or for very short strings)
	// This is less critical if the "first strong" heuristic is effective.
	let rtlCharCount = 0;
	let totalScriptChars = 0; // Count characters that are part of any typical script (Latin, Hebrew, Arabic etc.)

	for (let i = 0; i < processedText.length; i++) {
		const char = processedText[i];
		if (isRtlChar(char)) {
			rtlCharCount++;
		}
		// Consider if a character is broadly "alphabetic" in any relevant script
		// \p{L} matches any kind of letter from any language.
		if (/\p{L}/u.test(char)) {
			totalScriptChars++;
		}
	}

	if (totalScriptChars === 0) {
		return 'ltr'; // Default if no script characters found (e.g., only numbers and symbols)
	}

	// Determine direction based on character count majority
	if ((rtlCharCount / totalScriptChars) > 0.4) { // Adjusted threshold slightly, e.g. 40%
		return 'rtl';
	} else {
		return 'ltr';
	}
}

// Make functions available for import (conceptual in this environment)
// In a real module system, this would be:
// export { isRtlChar, getBlockDirection };
if (typeof module !== 'undefined' && module.exports) {
	module.exports = { isRtlChar, getBlockDirection };
} else {
	// Make them globally available for the sake of this single-file simulation if not using modules
	window.isRtlChar = isRtlChar;
	window.getBlockDirection = getBlockDirection;
}
