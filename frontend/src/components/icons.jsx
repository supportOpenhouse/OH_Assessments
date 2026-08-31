// Icons come from react-icons.
//
// `/lu` is Lucide, which is what openhouse.in itself uses — their markup is full
// of `lucide lucide-search`, `lucide-menu`, `lucide-log-in`, all stroke-2 on a
// 24 viewBox. Matching the set is the point: this app should look like it came
// from the same place.
//
// Lucide dropped brand marks, so the four socials come from `/fa6`. One package
// covers both, which is why react-icons rather than lucide-react.
//
// Everything is re-exported under our own names so a swap is one file.

import {
  LuSun, LuMoon, LuLogOut, LuUpload, LuCheck, LuTriangleAlert,
  LuArrowRight, LuArrowLeft, LuPencil, LuX,
  LuInbox, LuUsers, LuActivity, LuUser, LuClipboardList, LuHistory,
  LuPlay, LuPause, LuRotateCcw, LuRotateCw,
  // Kept for the audio player's commented-out controls — see AudioPlayer.jsx.
  LuVolume2, LuHeart, LuSkipBack, LuSkipForward,
} from 'react-icons/lu';
import {
  FaFacebookF, FaInstagram, FaLinkedinIn, FaYoutube,
} from 'react-icons/fa6';

// openhouse.in draws Lucide at stroke-width 2. Ours match rather than sitting a
// half-step lighter.
const wrap = (Cmp, defaults = {}) => {
  const Icon = (props) => (
    <Cmp size={16} strokeWidth={2} aria-hidden="true" focusable="false"
         {...defaults} {...props} />
  );
  Icon.displayName = Cmp.displayName || Cmp.name;
  return Icon;
};

export const IconSun = wrap(LuSun);
export const IconMoon = wrap(LuMoon);
export const IconSignOut = wrap(LuLogOut);
export const IconUpload = wrap(LuUpload);
export const IconCheck = wrap(LuCheck);
export const IconAlert = wrap(LuTriangleAlert);
export const IconArrow = wrap(LuArrowRight);
export const IconBack = wrap(LuArrowLeft);
export const IconEdit = wrap(LuPencil);
export const IconClose = wrap(LuX);

// Navigation
export const IconSubmissions = wrap(LuInbox);
export const IconCandidates = wrap(LuUsers);
export const IconActivity = wrap(LuActivity);
export const IconProfile = wrap(LuUser);
export const IconAssessments = wrap(LuClipboardList);
export const IconHistory = wrap(LuHistory);

// Audio transport. Play/pause are filled — a stroked triangle reads as an
// outline, not a button you press.
export const IconPlay = wrap(LuPlay, { fill: 'currentColor', strokeWidth: 1 });
export const IconPause = wrap(LuPause, { fill: 'currentColor', strokeWidth: 1 });
export const IconBack10 = wrap(LuRotateCcw);
export const IconForward10 = wrap(LuRotateCw);

// Parked for the player's commented-out controls.
export const IconVolume = wrap(LuVolume2);
export const IconHeart = wrap(LuHeart);
export const IconPrev = wrap(LuSkipBack);
export const IconNext = wrap(LuSkipForward);

// Brand marks are filled, not stroked — an outlined logo stops reading as that
// logo — so they take no strokeWidth.
const brand = (Cmp) => {
  const Icon = (props) => <Cmp size={18} aria-hidden="true" focusable="false" {...props} />;
  Icon.displayName = Cmp.displayName || Cmp.name;
  return Icon;
};

export const IconFacebook = brand(FaFacebookF);
export const IconInstagram = brand(FaInstagram);
export const IconLinkedIn = brand(FaLinkedinIn);
export const IconYouTube = brand(FaYoutube);
