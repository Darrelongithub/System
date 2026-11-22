import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FRICTION_PRESETS, type FrictionPreset } from "@/lib/pipeline/friction";
export { FRICTION_PRESETS, frictionInR, summarizeFrictionAdjustedR, type FrictionPreset } from "@/lib/pipeline/friction";

export function ExecutionFriction({
  value,
  onChange,
}: {
  value: FrictionPreset;
  onChange: (value: FrictionPreset) => void;
}) {
  const selected = FRICTION_PRESETS[value];
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs" data-testid="execution-friction">
      <label htmlFor="execution-friction" className="font-medium">
        XAUUSD round-turn friction
      </label>
      <Select value={value} onValueChange={(next) => onChange(next as FrictionPreset)}>
        <SelectTrigger id="execution-friction" className="h-8 w-52">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(FRICTION_PRESETS).map(([key, preset]) => (
            <SelectItem key={key} value={key}>
              {preset.label} · ${preset.cost.toFixed(2)}/oz
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <span className="text-muted-foreground">
        Selected: {selected.label} ${selected.cost.toFixed(2)}/oz round-turn
      </span>
    </div>
  );
}
