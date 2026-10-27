import type { LanguageCode } from '../domain/languages.js';

// Scripted agent lines per language. Every line identifies the caller as Bulkskart's
// AI assistant and makes no product, fee, or outcome claims. The Hindi, Tamil, Telugu,
// and Malayalam wording must be reviewed by a native speaker before any live campaign.
export type TemplateKey =
  | 'greeting'
  | 'pitch'
  | 'ask_products'
  | 'products_noted'
  | 'ask_callback_time'
  | 'callback_noted'
  | 'stop_confirmed'
  | 'transfer_human'
  | 'not_understood'
  | 'unknown_answer'
  | 'offer_link'
  | 'link_queued'
  | 'farewell'
  | 'follow_up_question'
  | 'ask_convenient_time';

export const TEMPLATES: Record<LanguageCode, Record<TemplateKey, string>> = {
  en: {
    greeting: "Hello, this is Bulkskart's AI assistant calling. Is this a convenient time to speak for two minutes?",
    pitch: 'Bulkskart is a B2B bulk trading marketplace where manufacturers and suppliers can reach bulk buyers.',
    ask_products: 'What products does your company manufacture?',
    products_noted: 'Thank you, I have noted that. Do you have any questions about Bulkskart?',
    ask_callback_time: 'No problem. When would be a good time for our team to call you back?',
    callback_noted: 'Thank you. I have noted your preferred time for a callback.',
    stop_confirmed: 'Understood. We will not call you again for marketing. Thank you for your time.',
    transfer_human: 'Let me connect you with a Bulkskart team member.',
    not_understood: 'Sorry, I did not catch that. Could you please repeat?',
    unknown_answer: "I do not have confirmed information on that. I will ask a Bulkskart team member to follow up with you.",
    offer_link: 'Would you like me to send the Bulkskart website link to this number?',
    link_queued: 'The website link will be sent shortly.',
    farewell: 'Thank you for your time. Have a good day.',
    follow_up_question: 'Do you have any other questions?',
    ask_convenient_time: 'Is this a convenient time to speak?',
  },
  hi: {
    greeting: 'नमस्ते, मैं Bulkskart का AI सहायक बोल रहा हूँ। क्या अभी दो मिनट बात करने का सही समय है?',
    pitch: 'Bulkskart एक B2B बल्क ट्रेडिंग मार्केटप्लेस है, जहाँ निर्माता और आपूर्तिकर्ता बड़े खरीदारों तक पहुँच सकते हैं।',
    ask_products: 'आपकी कंपनी कौन-से उत्पाद बनाती है?',
    products_noted: 'धन्यवाद, मैंने नोट कर लिया है। क्या Bulkskart के बारे में आपका कोई सवाल है?',
    ask_callback_time: 'कोई बात नहीं। हमारी टीम आपको किस समय दोबारा कॉल करे?',
    callback_noted: 'धन्यवाद। मैंने दोबारा कॉल के लिए आपका समय नोट कर लिया है।',
    stop_confirmed: 'ठीक है। हम आपको दोबारा मार्केटिंग कॉल नहीं करेंगे। आपके समय के लिए धन्यवाद।',
    transfer_human: 'मैं आपको Bulkskart की टीम के एक सदस्य से जोड़ता हूँ।',
    not_understood: 'माफ़ कीजिए, मैं ठीक से समझ नहीं पाया। क्या आप दोहरा सकते हैं?',
    unknown_answer: 'इसकी पुष्टि की गई जानकारी मेरे पास नहीं है। मैं हमारी टीम के किसी सदस्य से आपसे संपर्क करने के लिए कहूँगा।',
    offer_link: 'क्या मैं Bulkskart की वेबसाइट का लिंक इस नंबर पर भेज दूँ?',
    link_queued: 'वेबसाइट का लिंक जल्द ही भेजा जाएगा।',
    farewell: 'धन्यवाद। आपका दिन शुभ हो।',
    follow_up_question: 'क्या आपका कोई और सवाल है?',
    ask_convenient_time: 'क्या अभी बात करने का सही समय है?',
  },
  ta: {
    greeting: 'வணக்கம், நான் Bulkskart-இன் AI உதவியாளர் பேசுகிறேன். இரண்டு நிமிடம் பேச இப்போது உங்களுக்கு வசதியாக உள்ளதா?',
    pitch: 'Bulkskart ஒரு B2B மொத்த வர்த்தக சந்தை. உற்பத்தியாளர்களும் சப்ளையர்களும் பெரிய வாங்குபவர்களைச் சென்றடைய இது உதவுகிறது.',
    ask_products: 'உங்கள் நிறுவனம் என்ன பொருட்களைத் தயாரிக்கிறது?',
    products_noted: 'நன்றி, குறித்துக்கொண்டேன். Bulkskart பற்றி ஏதேனும் கேள்விகள் உள்ளதா?',
    ask_callback_time: 'பரவாயில்லை. எங்கள் குழு உங்களை எப்போது மீண்டும் அழைக்கலாம்?',
    callback_noted: 'நன்றி. மீண்டும் அழைப்புக்கான உங்கள் நேரத்தைக் குறித்துக்கொண்டேன்.',
    stop_confirmed: 'சரி. இனி விளம்பர அழைப்புகள் செய்ய மாட்டோம். உங்கள் நேரத்திற்கு நன்றி.',
    transfer_human: 'Bulkskart குழுவில் ஒருவருடன் உங்களை இணைக்கிறேன்.',
    not_understood: 'மன்னிக்கவும், சரியாகக் கேட்கவில்லை. மீண்டும் சொல்ல முடியுமா?',
    unknown_answer: 'அது குறித்து உறுதிசெய்யப்பட்ட தகவல் என்னிடம் இல்லை. எங்கள் குழுவில் ஒருவர் உங்களைத் தொடர்புகொள்ளுமாறு கேட்கிறேன்.',
    offer_link: 'Bulkskart இணையதள இணைப்பை இந்த எண்ணுக்கு அனுப்பட்டுமா?',
    link_queued: 'இணையதள இணைப்பு விரைவில் அனுப்பப்படும்.',
    farewell: 'நன்றி. உங்கள் நாள் இனிதாகட்டும்.',
    follow_up_question: 'வேறு ஏதேனும் கேள்விகள் உள்ளதா?',
    ask_convenient_time: 'இப்போது பேச வசதியாக உள்ளதா?',
  },
  te: {
    greeting: 'నమస్కారం, నేను Bulkskart AI సహాయకుడిని మాట్లాడుతున్నాను. రెండు నిమిషాలు మాట్లాడటానికి ఇప్పుడు అనుకూలంగా ఉందా?',
    pitch: 'Bulkskart ఒక B2B బల్క్ ట్రేడింగ్ మార్కెట్\u200cప్లేస్. తయారీదారులు మరియు సరఫరాదారులు పెద్ద కొనుగోలుదారులను చేరుకోవడానికి ఇది సహాయపడుతుంది.',
    ask_products: 'మీ కంపెనీ ఏ ఉత్పత్తులను తయారు చేస్తుంది?',
    products_noted: 'ధన్యవాదాలు, నమోదు చేసుకున్నాను. Bulkskart గురించి ఏవైనా ప్రశ్నలు ఉన్నాయా?',
    ask_callback_time: 'పర్వాలేదు. మా బృందం మిమ్మల్ని ఏ సమయంలో మళ్లీ కాల్ చేయాలి?',
    callback_noted: 'ధన్యవాదాలు. మళ్లీ కాల్ కోసం మీ సమయాన్ని నమోదు చేసుకున్నాను.',
    stop_confirmed: 'సరే. ఇకపై మేము మార్కెటింగ్ కాల్స్ చేయము. మీ సమయానికి ధన్యవాదాలు.',
    transfer_human: 'మిమ్మల్ని Bulkskart బృందంలోని ఒకరితో కలుపుతున్నాను.',
    not_understood: 'క్షమించండి, సరిగ్గా వినబడలేదు. మళ్లీ చెప్పగలరా?',
    unknown_answer: 'దీని గురించి ధృవీకరించిన సమాచారం నా దగ్గర లేదు. మా బృందంలో ఒకరు మిమ్మల్ని సంప్రదించమని అడుగుతాను.',
    offer_link: 'Bulkskart వెబ్‌సైట్ లింక్‌ను ఈ నంబర్‌కు పంపమంటారా?',
    link_queued: 'వెబ్‌సైట్ లింక్ త్వరలో పంపబడుతుంది.',
    farewell: 'ధన్యవాదాలు. మీకు శుభదినం.',
    follow_up_question: 'మీకు ఇంకా ఏవైనా ప్రశ్నలు ఉన్నాయా?',
    ask_convenient_time: 'ఇప్పుడు మాట్లాడటానికి అనుకూలంగా ఉందా?',
  },
  ml: {
    greeting: 'നമസ്കാരം, ഞാൻ Bulkskart-ന്റെ AI അസിസ്റ്റന്റ് ആണ് വിളിക്കുന്നത്. രണ്ട് മിനിറ്റ് സംസാരിക്കാൻ ഇപ്പോൾ സൗകര്യമാണോ?',
    pitch: 'Bulkskart ഒരു B2B ബൾക്ക് ട്രേഡിംഗ് മാർക്കറ്റ്പ്ലേസ് ആണ്. നിർമ്മാതാക്കൾക്കും വിതരണക്കാർക്കും വലിയ വാങ്ങുന്നവരിലേക്ക് എത്താൻ ഇത് സഹായിക്കുന്നു.',
    ask_products: 'നിങ്ങളുടെ കമ്പനി ഏത് ഉൽപ്പന്നങ്ങളാണ് നിർമ്മിക്കുന്നത്?',
    products_noted: 'നന്ദി, രേഖപ്പെടുത്തി. Bulkskart-നെക്കുറിച്ച് എന്തെങ്കിലും ചോദ്യങ്ങളുണ്ടോ?',
    ask_callback_time: 'കുഴപ്പമില്ല. ഞങ്ങളുടെ ടീം നിങ്ങളെ എപ്പോഴാണ് വീണ്ടും വിളിക്കേണ്ടത്?',
    callback_noted: 'നന്ദി. വീണ്ടും വിളിക്കാനുള്ള സമയം രേഖപ്പെടുത്തി.',
    stop_confirmed: 'ശരി. ഇനി മാർക്കറ്റിംഗ് കോളുകൾ ചെയ്യില്ല. നിങ്ങളുടെ സമയത്തിന് നന്ദി.',
    transfer_human: 'നിങ്ങളെ Bulkskart ടീമിലെ ഒരാളുമായി ബന്ധിപ്പിക്കാം.',
    not_understood: 'ക്ഷമിക്കണം, വ്യക്തമായി കേട്ടില്ല. ഒന്നുകൂടി പറയാമോ?',
    unknown_answer: 'അതിനെക്കുറിച്ച് സ്ഥിരീകരിച്ച വിവരം എന്റെ പക്കലില്ല. ഞങ്ങളുടെ ടീമിലെ ഒരാൾ നിങ്ങളെ ബന്ധപ്പെടും.',
    offer_link: 'Bulkskart വെബ്സൈറ്റ് ലിങ്ക് ഈ നമ്പറിലേക്ക് അയയ്ക്കട്ടെ?',
    link_queued: 'വെബ്സൈറ്റ് ലിങ്ക് ഉടൻ അയയ്ക്കും.',
    farewell: 'നന്ദി. നിങ്ങൾക്ക് നല്ലൊരു ദിവസം ആശംസിക്കുന്നു.',
    follow_up_question: 'മറ്റെന്തെങ്കിലും ചോദ്യങ്ങളുണ്ടോ?',
    ask_convenient_time: 'ഇപ്പോൾ സംസാരിക്കാൻ സൗകര്യമാണോ?',
  },
};

export function template(language: LanguageCode, key: TemplateKey): string {
  return TEMPLATES[language][key];
}
