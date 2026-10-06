"use client";

import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { agentConfigSchema } from "omni-shared";
import { api } from "@/lib/api";
import axios from "axios";

// z.infer builds the TS type straight from the schema, so the form's types and the validation rules can never drift apart.
export type AgentConfigFormValues = z.infer<typeof agentConfigSchema>;

interface AgentConfigFormProps {
	tenantId: string;
	defaultValues: AgentConfigFormValues;
	onSaved?: (values: AgentConfigFormValues) => void;
}

// ---- 2. A tiny helper that turns a field's validation state into the border color + icon. This is the whole "red until valid, green with a tick" behavior —
function fieldStateClasses(opts: { isTouched: boolean; isDirty: boolean; hasError: boolean }): string {
	const { isTouched, isDirty, hasError } = opts;

	// Field hasn't been interacted with yet — stay neutral, don't scold the user before they've even typed anything.
	if (!isTouched && !isDirty) return "border-input";

	if (hasError) return "border-red-500 focus-visible:ring-red-500";

	return "border-green-500 focus-visible:ring-green-500";
}

export function AgentConfigForm({ tenantId, defaultValues, onSaved }: AgentConfigFormProps) {
	const [submitError, setSubmitError] = useState<string | null>(null);
	const [pending, setPending] = useState(false);

	const form = useForm<AgentConfigFormValues>({
		resolver: zodResolver(agentConfigSchema),
		defaultValues,
		mode: "onChange",
	});
	const { dirtyFields, isValid } = form.formState;
	const hasDirty = Object.keys(dirtyFields).length > 0;

	async function send(method: "POST" | "PATCH", body: Partial<AgentConfigFormValues>) {
		setSubmitError(null);
		setPending(true);

		const fullbody = { ...body, tenantId };

		try {
			if (method === "POST") {
				const response = await api.post("/api/dashboard/settings/agent_config", { ...fullbody });
				form.reset(response?.data);
				onSaved?.(response?.data);
			} else if (method === "PATCH") {
				const response = await api.patch("/api/dashboard/settings/agent_config", { ...fullbody });
				form.reset(response?.data);
				onSaved?.(response?.data);
			}
		} catch (error) {
			const errorMessage = axios.isAxiosError(error) ? error.response?.data?.message : undefined;
			setSubmitError(errorMessage || "Something went wrong saving your AI settings.");
		} finally {
			setPending(false);
		}
	}

	// Full setup: handleSubmit validates every field.
	const onFullSetupSubmit = form.handleSubmit((values) => send("POST", values));

	// Tweak: validate only the fields the user actually changed.
	async function onTweak() {
		const keys = Object.keys(dirtyFields) as (keyof AgentConfigFormValues)[];
		if (!hasDirty) return;

		const validate = await form.trigger(keys);
		if (!validate) return;

		const values = form.getValues();
		const patch = Object.fromEntries(keys.map((k) => [k, values[k]])) as Partial<AgentConfigFormValues>;

		await send("PATCH", patch);
	}

	return (
		<form onSubmit={onFullSetupSubmit} className="space-y-6">
			<FieldGroup>
				<Controller
					control={form.control}
					name="modelName"
					render={({ field, fieldState }) => (
						<Field data-invalid={fieldState.invalid || undefined}>
							<FieldLabel htmlFor="modelName">Model</FieldLabel>
							<Select onValueChange={field.onChange} value={field.value}>
								<SelectTrigger
									id="modelName"
									aria-invalid={fieldState.invalid}
									className={cn(
										fieldStateClasses({
											isTouched: fieldState.isTouched,
											isDirty: fieldState.isDirty,
											hasError: fieldState.invalid,
										}),
									)}
								>
									<SelectValue placeholder="Select a model" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="gemini-2.5-flash">Gemini 2.5 Flash (fastest, cheapest)</SelectItem>
									<SelectItem value="gemini-2.5-flash-lite">Gemini 2.5 Flash lite (fast and efficient)</SelectItem>
									<SelectItem value="gemini-3.1-flash-lite">Gemini 3.1 Flash Lite (fastest, cheapest)</SelectItem>
									<SelectItem value="gemini-3.5-flash">Gemini 3.5 Flash (balanced)</SelectItem>
									<SelectItem value="gemini-3.5-flash-lite">Gemini 3.5 Flash lite (balanced)</SelectItem>
									<SelectItem value="gemini-3.6-flash">Gemini 3.6 Flash (higher quality)</SelectItem>
									<SelectItem value="gemini-3.7-flash">Gemini 3.7 Flash (highest quality)</SelectItem>
									<SelectItem value="gemini-3.8-flash">Gemini 3.8 Flash (highest quality)</SelectItem>
								</SelectContent>
							</Select>
							<FieldError errors={fieldState.error ? [fieldState.error] : undefined} />
						</Field>
					)}
				/>

				<Controller
					control={form.control}
					name="temperature"
					render={({ field, fieldState }) => (
						<Field data-invalid={fieldState.invalid || undefined}>
							<FieldLabel htmlFor="temperature" className="flex items-center gap-1.5">
								Temperature
								{!fieldState.invalid && (fieldState.isTouched || fieldState.isDirty) && (
									<CheckCircle2 className="h-4 w-4 text-green-500" />
								)}
							</FieldLabel>
							<Input
								id="temperature"
								type="number"
								step="0.1"
								min={0}
								max={2}
								aria-invalid={fieldState.invalid}
								className={fieldStateClasses({
									isTouched: fieldState.isTouched,
									isDirty: fieldState.isDirty,
									hasError: fieldState.invalid,
								})}
								{...field}
								// Number inputs give you a string from the DOM — coerce it before it hits Zod's z.number() check.
								onChange={(e) => field.onChange(e.target.value === "" ? e.target.value : Number(e.target.value))}
							/>
							<FieldDescription>0 = focused and deterministic, 2 = more varied/creative replies.</FieldDescription>
							<FieldError errors={fieldState.error ? [fieldState.error] : undefined} />
						</Field>
					)}
				/>

				<Controller
					control={form.control}
					name="systemPrompt"
					render={({ field, fieldState }) => (
						<Field data-invalid={fieldState.invalid || undefined}>
							<FieldLabel htmlFor="systemPrompt" className="flex items-center gap-1.5">
								System prompt
								{!fieldState.invalid && (fieldState.isTouched || fieldState.isDirty) && (
									<CheckCircle2 className="h-4 w-4 text-green-500" />
								)}
							</FieldLabel>
							<Textarea
								id="systemPrompt"
								rows={6}
								aria-invalid={fieldState.invalid}
								className={fieldStateClasses({
									isTouched: fieldState.isTouched,
									isDirty: fieldState.isDirty,
									hasError: fieldState.invalid,
								})}
								{...field}
							/>
							<FieldDescription>{field.value?.length ?? 0} / 4000 characters</FieldDescription>
							<FieldError errors={fieldState.error ? [fieldState.error] : undefined} />
						</Field>
					)}
				/>

				<Controller
					control={form.control}
					name="isActive"
					render={({ field }) => (
						<Field orientation="horizontal" className="rounded-lg border p-3">
							<FieldContent>
								<FieldLabel htmlFor="isActive">AI assistant active</FieldLabel>
								<FieldDescription>Turn the live AI agent on or off for this workspace.</FieldDescription>
							</FieldContent>
							<Switch id="isActive" checked={field.value} onCheckedChange={field.onChange} />
						</Field>
					)}
				/>
			</FieldGroup>

			{submitError && <p className="text-sm text-red-500">{submitError}</p>}

			<div className="flex gap-3">
				<Button type="submit" disabled={!isValid || pending}>
					{pending ? "Saving..." : "Save Initial Setup"}
				</Button>
				<Button type="button" variant="outline" onClick={onTweak} disabled={!hasDirty || pending}>
					Save changes
				</Button>
			</div>
		</form>
	);
}
