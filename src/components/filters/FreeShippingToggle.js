import { useAtom } from 'jotai';
import { freeShippingOnlyAtom } from '@/store/atoms';
import { motion } from 'framer-motion';

export default function FreeShippingToggle({ compact=false }) {
  const [enabled, setEnabled] = useAtom(freeShippingOnlyAtom);
  return (
    <motion.label layout className="flex items-center gap-2 text-xs font-medium cursor-pointer select-none">
      <input
        type="checkbox"
        className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
        checked={!!enabled}
        onChange={() => setEnabled(e => !e)}
      />
      <span className="text-gray-700 dark:text-gray-300">Free shipping only <span className="font-normal text-[11px] text-gray-400 dark:text-gray-500">(unknown last)</span></span>
    </motion.label>
  );
}
