-- Migration: Create question_bank table for reroll feature
-- Purpose: Store all questions in database for scalable, admin-manageable question system
-- This enables automatic random question selection during rerolls

-- Create question_bank table
CREATE TABLE IF NOT EXISTS question_bank (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  level INTEGER NOT NULL CHECK (level BETWEEN 1 AND 5),
  question_text TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create index for fast lookups by level
CREATE INDEX idx_question_bank_level ON question_bank(level) WHERE is_active = true;

-- Seed Level 5 Questions (Core Identity/Sense of Self)
INSERT INTO question_bank (level, question_text) VALUES
  (5, 'What would you sacrifice everything for?'),
  (5, 'What do you believe you''re meant to do in life?'),
  (5, 'If you could only be remembered for one thing, what would it be?'),
  (5, 'Who are you when no one is watching?'),
  (5, 'What part of yourself do you most struggle to accept?'),
  (5, 'What''s the real reason you do what you do?'),
  (5, 'What truth about yourself have you been avoiding?'),
  (5, 'What would make your life feel complete?'),
  (5, 'If you were to die this evening with no opportunity to communicate with anyone, what would you most regret not having told someone?'),
  (5, 'What do you know you need to change but haven''t?'),
  (5, 'If you could restart your life, what would you do differently?'),
  (5, 'What makes you feel most alive?'),
  (5, 'What''s the most important thing no one knows about you?'),
  (5, 'What part of yourself do you hide from everyone?'),
  (5, 'How do you define what makes something ''right'' or ''wrong''?'),
  (5, 'When you''re alone with your thoughts, who do you think you really are?'),
  (5, 'What would you do if you knew you couldn''t fail?'),
  (5, 'What part of you died that you wish you could bring back?'),
  (5, 'If a crystal ball could tell you the truth about yourself, your life, or the future, what would you want to know?'),
  (5, 'What scares you most about the future?'),
  (5, 'What do you need to let go of?'),
  (5, 'What''s the hardest choice you''ve ever had to make?'),
  (5, 'If you knew that in one year you would die suddenly, would you change anything about the way you are now living?'),
  (5, 'What do you fear most about being truly known?'),
  (5, 'What truth are you running from?');

-- Seed Level 4 Questions (Emotions and Vulnerabilities)
INSERT INTO question_bank (level, question_text) VALUES
  (4, 'When did you last cry alone?'),
  (4, 'What emotion do you struggle to express?'),
  (4, 'What makes you feel inadequate?'),
  (4, 'When do you feel most misunderstood?'),
  (4, 'What childhood wound still affects you?'),
  (4, 'What makes you feel unlovable?'),
  (4, 'When did you feel most betrayed?'),
  (4, 'What insecurity do you try to hide?'),
  (4, 'What makes you feel powerless?'),
  (4, 'What failure still haunts you?'),
  (4, 'What makes you feel ashamed?'),
  (4, 'What fear controls your decisions?'),
  (4, 'When did you last feel completely safe?'),
  (4, 'What emotion do you wish you could unfeel?'),
  (4, 'When did you feel most loved?'),
  (4, 'What makes you feel most grateful?'),
  (4, 'What''s the most vulnerable you''ve ever felt?'),
  (4, 'What are you most afraid of?'),
  (4, 'When do you feel most insecure?'),
  (4, 'What do you wish people knew about you that they don''t?'),
  (4, 'Share with your partner an embarrassing moment in your life'),
  (4, 'When did you last cry in front of another person? By yourself?'),
  (4, 'What makes you feel most alone?'),
  (4, 'When did you feel most hurt by someone you loved?'),
  (4, 'What rejection hurt you the most?'),
  (4, 'What compliment do you secretly crave?'),
  (4, 'When do you feel like an imposter?'),
  (4, 'What anger are you holding onto?'),
  (4, 'What sadness are you carrying?'),
  (4, 'If you could erase one memory, which would it be and why?');

-- Seed Level 3 Questions (Personal Experiences)
INSERT INTO question_bank (level, question_text) VALUES
  (3, 'Take four minutes and tell your partner your life story in as much detail as possible'),
  (3, 'What''s your most treasured memory?'),
  (3, 'What''s your most terrible memory?'),
  (3, 'What belief have you completely reversed?'),
  (3, 'What do you value most in other people?'),
  (3, 'What does friendship mean to you?'),
  (3, 'What roles do love and affection play in your life?'),
  (3, 'How close and warm is your family? Do you feel your childhood was happier than most other people''s?'),
  (3, 'If you could change anything about the way you were raised, what would it be?'),
  (3, 'What is the greatest accomplishment of your life?'),
  (3, 'Is there something that you''ve dreamed of doing for a long time? Why haven''t you done it?'),
  (3, 'What do you regret not doing when you had the chance?'),
  (3, 'What''s the most painful truth you''ve ever had to accept?'),
  (3, 'Tell me about a time you failed at something important'),
  (3, 'What''s a memory that shaped you?'),
  (3, 'Have you ever had your heart broken?'),
  (3, 'What''s the craziest thing that''s happened to you?'),
  (3, 'Of all the people in your family, whose death would you find most disturbing? Why?'),
  (3, 'Your house catches fire. After saving loved ones and pets, you can save one item. What would it be and why?'),
  (3, 'What''s the most spontaneous thing you''ve done?'),
  (3, 'What decision do you regret the most?'),
  (3, 'What''s the most trouble you''ve been in?'),
  (3, 'When did you realize you''d changed?'),
  (3, 'What''s your proudest accomplishment?'),
  (3, 'What''s the best advice you''ve ever received?');

-- Seed Level 2 Questions (Preferences and Opinions)
INSERT INTO question_bank (level, question_text) VALUES
  (2, 'Given the choice of anyone in the world, whom would you want as a dinner guest?'),
  (2, 'Would you like to be famous? In what way?'),
  (2, 'What would constitute a ''perfect'' day for you?'),
  (2, 'If you could wake up tomorrow having gained any one quality or ability, what would it be?'),
  (2, 'What''s your most controversial opinion?'),
  (2, 'What do you think happens after we die?'),
  (2, 'Do you believe people can truly change?'),
  (2, 'What''s your definition of success?'),
  (2, 'What do you think is the meaning of life?'),
  (2, 'Do you believe in soul mates?'),
  (2, 'What do you think makes a good person?'),
  (2, 'Is happiness a choice or a circumstance?'),
  (2, 'What''s your relationship with religion/spirituality?'),
  (2, 'Do you believe in fate or free will?'),
  (2, 'What do you think is the biggest problem in the world?'),
  (2, 'What would you change about the world?'),
  (2, 'Do you believe humans are inherently good or bad?'),
  (2, 'What''s more important: truth or kindness?'),
  (2, 'What, if anything, is too serious to be joked about?'),
  (2, 'What''s your biggest pet peeve?'),
  (2, 'What habit would you never give up?'),
  (2, 'What''s your guilty pleasure?'),
  (2, 'What''s something you used to believe but don''t anymore?'),
  (2, 'What''s your relationship deal-breaker?'),
  (2, 'What''s something you''re afraid to try?'),
  (2, 'What''s something you pretend to like but actually hate?'),
  (2, 'What''s your most irrational fear?'),
  (2, 'What''s something you''re secretly competitive about?'),
  (2, 'What''s your controversial food opinion?'),
  (2, 'If you were able to live to the age of 90 and retain either the mind or body of a 30-year-old for the last 60 years of your life, which would you want?');

-- Seed Level 1 Questions (Biographical/Factual)
INSERT INTO question_bank (level, question_text) VALUES
  (1, 'What''s your job?'),
  (1, 'Where are you from?'),
  (1, 'How many siblings do you have?'),
  (1, 'What do you do for fun?'),
  (1, 'Where did you go to school?'),
  (1, 'Do you have any pets?'),
  (1, 'Where do you live?'),
  (1, 'What language(s) do you speak?'),
  (1, 'When did you last sing to yourself? To someone else?'),
  (1, 'Before making a telephone call, do you ever rehearse what you are going to say? Why?'),
  (1, 'What''s your favorite food?'),
  (1, 'What''s your favorite movie?'),
  (1, 'What''s your favorite color?'),
  (1, 'What''s your favorite song?'),
  (1, 'What''s your favorite season?'),
  (1, 'Are you a morning person or night owl?'),
  (1, 'What''s your favorite book?'),
  (1, 'Coffee or tea?'),
  (1, 'What''s your favorite hobby?'),
  (1, 'What''s your favorite TV show?'),
  (1, 'What kind of music do you like?'),
  (1, 'What''s your zodiac sign?'),
  (1, 'What''s your go-to restaurant?'),
  (1, 'What''s your favorite sport?'),
  (1, 'Beach or mountains?'),
  (1, 'What''s your favorite vacation spot?'),
  (1, 'What''s your favorite ice cream flavor?'),
  (1, 'What''s your favorite holiday?'),
  (1, 'Do you have a secret hunch about how you will die?'),
  (1, 'For what in your life do you feel most grateful?');

-- Add comment for documentation
COMMENT ON TABLE question_bank IS 'Bank of questions for the Intimacy Ladder game, organized by intimacy level (5=most intimate, 1=least intimate)';
COMMENT ON COLUMN question_bank.level IS 'Intimacy level from 1 (biographical) to 5 (core identity)';
COMMENT ON COLUMN question_bank.is_active IS 'Flag to enable/disable questions without deletion (for future admin panel)';
