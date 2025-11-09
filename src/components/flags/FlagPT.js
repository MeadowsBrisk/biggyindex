export default function FlagPT({ className = "w-6 h-6" }) {
  return (
    <svg className={className} viewBox="0 0 640 480" xmlns="http://www.w3.org/2000/svg">
      <path fill="#060" d="M0 0h640v480H0z"/>
      <path fill="#D80027" d="M256 0h384v480H256z"/>
      <circle cx="256" cy="240" r="80" fill="#FFDA44"/>
      <path fill="#D80027" d="M256 160a80 80 0 0 0 0 160 64 64 0 0 1 0-160z"/>
      <path fill="#FFF" d="M224 240h64v16h-64z"/>
      <path fill="#FFF" d="M248 216h16v64h-16z"/>
    </svg>
  );
}
