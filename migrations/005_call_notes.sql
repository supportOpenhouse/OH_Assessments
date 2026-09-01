-- 005 — the candidate's notes from the call.
--
-- The assessment became a real cold call to a property owner found on
-- MagicBricks/99acres: the candidate logs the address, the seller's name, the
-- phone number and the asking price, then submits those alongside the audio.
--
-- Additive and nullable, so every existing submission stays valid — the rows
-- taken before this shipped simply have no notes.
--
-- Also folded into 001_schema.sql, which is the baseline for a fresh database.
-- This file is for the one that already has candidate data in it.

alter table sales_insight_submissions
  add column if not exists notes text;
