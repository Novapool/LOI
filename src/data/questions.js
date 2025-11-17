/**
 * Question bank organized by intimacy level
 * Level 5 = Most intimate (Core Identity)
 * Level 1 = Least intimate (Biographical)
 */

export const QUESTIONS = {
  5: [
    "What would you sacrifice everything for?",
    "What truth about yourself have you been avoiding?",
    "What do you fear most about being truly known?",
    "If you could erase one memory, which would it be and why?",
    "What's the deepest lie you've told yourself?",
    "What makes you feel most alive?",
    "What part of yourself do you hide from everyone?",
    "What would you do if you knew you couldn't fail?",
    "What's the most painful truth you've ever had to accept?",
    "Who are you when no one is watching?",
    "What do you wish you could tell your younger self?",
    "What's the one thing you'll never forgive yourself for?",
    "What scares you most about the future?",
    "What do you need to let go of?",
    "What's the most vulnerable you've ever felt?",
    "What's the real reason you do what you do?",
    "What truth are you running from?",
    "What would make your life feel complete?",
    "What part of you died that you wish you could bring back?",
    "What do you know you need to change but haven't?",
    "If you could restart your life, what would you do differently?",
    "What's the most important thing no one knows about you?",
    "What makes you feel most alone?",
    "What do you regret not doing when you had the chance?",
    "What's the hardest choice you've ever had to make?"
  ],

  4: [
    "When did you last cry alone?",
    "What emotion do you struggle to express?",
    "What makes you feel inadequate?",
    "When do you feel most misunderstood?",
    "What childhood wound still affects you?",
    "What compliment do you secretly crave?",
    "When do you feel like an imposter?",
    "What rejection hurt you the most?",
    "What makes you feel unlovable?",
    "When did you feel most betrayed?",
    "What insecurity do you try to hide?",
    "What makes you feel powerless?",
    "When did you feel most abandoned?",
    "What failure still haunts you?",
    "What makes you feel ashamed?",
    "When do you feel most jealous?",
    "What anger are you holding onto?",
    "When did you feel most disappointed in yourself?",
    "What makes you feel guilty?",
    "When do you feel most anxious?",
    "What sadness are you carrying?",
    "When did you feel most hurt by someone you loved?",
    "What makes you feel most defensive?",
    "When did you feel most proud of yourself?",
    "What fear controls your decisions?",
    "When did you last feel completely safe?",
    "What emotion do you wish you could unfeel?",
    "When did you feel most loved?",
    "What makes you feel most grateful?",
    "When did you realize you'd changed?"
  ],

  3: [
    "What belief have you completely reversed?",
    "What's your most controversial opinion?",
    "What do you think happens after we die?",
    "What's more important: truth or kindness?",
    "Do you believe people can truly change?",
    "What's your definition of success?",
    "What do you think is the meaning of life?",
    "Is it ever okay to lie?",
    "What do you value most in other people?",
    "What's your biggest moral dilemma?",
    "Do you believe in fate or free will?",
    "What would you die for?",
    "What do you think is the biggest problem in the world?",
    "What's your most unpopular political belief?",
    "Do you believe in soul mates?",
    "What tradition do you think should end?",
    "What do you think makes a good person?",
    "Is happiness a choice or a circumstance?",
    "What's your relationship with religion/spirituality?",
    "What principle do you refuse to compromise on?",
    "Do you believe in second chances?",
    "What's more important: being right or being kind?",
    "What do you think society gets wrong?",
    "What's your biggest contradiction?",
    "Do you believe humans are inherently good or bad?",
    "What would you change about the world?",
    "What's your philosophy on money?",
    "Do you think we have a responsibility to others?",
    "What belief do you hold that most people disagree with?",
    "What do you think is worth fighting for?"
  ],

  2: [
    "What's your most unpopular opinion?",
    "What's the strangest thing you've ever done?",
    "What's your biggest pet peeve?",
    "What habit would you never give up?",
    "What's the most spontaneous thing you've done?",
    "What decision do you regret the most?",
    "What's your guilty pleasure?",
    "What's the best advice you've ever received?",
    "What's something you used to believe but don't anymore?",
    "What's the most embarrassing thing that's happened to you?",
    "What's your relationship deal-breaker?",
    "What's something you're afraid to try?",
    "What's the worst date you've been on?",
    "What's your proudest accomplishment?",
    "What's something you pretend to like but actually hate?",
    "What's the most trouble you've been in?",
    "What's your biggest waste of money?",
    "What's something you do that you judge others for doing?",
    "What's the best compliment you've received?",
    "What's your most irrational fear?",
    "What's something you're secretly competitive about?",
    "What's the worst job you've had?",
    "What's your most embarrassing moment?",
    "What's something you judge people for?",
    "What's the most ridiculous argument you've had?",
    "What's your controversial food opinion?",
    "What's something you're too old for but still do?",
    "What's the most illegal thing you've done?",
    "What's your most random skill?",
    "What's the weirdest compliment you've received?"
  ],

  1: [
    "What's your job?",
    "Where are you from?",
    "How many siblings do you have?",
    "What's your favorite food?",
    "What do you do for fun?",
    "What's your favorite movie?",
    "Where did you go to school?",
    "What's your favorite color?",
    "Do you have any pets?",
    "What's your favorite song?",
    "What's your birthday?",
    "What's your favorite season?",
    "Are you a morning person or night owl?",
    "What's your favorite book?",
    "Coffee or tea?",
    "What's your favorite hobby?",
    "What's your favorite TV show?",
    "Where do you live?",
    "What kind of music do you like?",
    "What's your zodiac sign?",
    "What's your go-to restaurant?",
    "What's your favorite sport?",
    "Mac or PC?",
    "What's your favorite vacation spot?",
    "What's your favorite ice cream flavor?",
    "What language(s) do you speak?",
    "What's your favorite holiday?",
    "Beach or mountains?",
    "What's your dream car?",
    "What's your shoe size?"
  ]
};

/**
 * Get a random question from a specific level
 *
 * @param {number} level - The question level (1-5)
 * @param {Array} exclude - Questions to exclude from selection
 * @returns {string} A random question from the level
 */
export function getRandomQuestion(level, exclude = []) {
  const questions = QUESTIONS[level] || QUESTIONS[1];
  const available = questions.filter(q => !exclude.includes(q));

  if (available.length === 0) {
    // If all questions have been used, reset and use any question
    return questions[Math.floor(Math.random() * questions.length)];
  }

  return available[Math.floor(Math.random() * available.length)];
}
