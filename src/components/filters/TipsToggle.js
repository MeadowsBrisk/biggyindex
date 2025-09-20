import { useAtom } from "jotai";
import { includeTipsAtom } from "@/store/atoms";

export default function TipsToggle() {
  const [includeTips, setIncludeTips] = useAtom(includeTipsAtom);
  return (
    <label className="flex items-center gap-2 select-none">
      <input type="checkbox" checked={includeTips} onChange={(e) => setIncludeTips(e.target.checked)} />
      <span className="text-sm">Include Tips</span>
    </label>
  );
}


