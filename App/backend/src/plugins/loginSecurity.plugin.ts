type Options = {
	maxAttempts?: number;
};

type Updates = {
	$inc: {
		loginAttempts: number;
		lockoutCount?: number;
	};
	$set?: {
		lockoutUntil?: Date;
	};
};

export const loginSecurityPlugin = (schema: any, options: Options = {}) => {
	const MAX_ATTEMPTS = options.maxAttempts ?? 5; //5 attempts before lockout
	const LOCKOUT_DURATIONS_MS = [
		5 * 60 * 1000, // 1st lockout:  5 minutes
		15 * 60 * 1000, // 2nd lockout: 15 minutes
		60 * 60 * 1000, // 3rd lockout:  1 hour
	];

	schema.add({
		loginAttempts: { type: Number, default: 0, select: false },
		lockoutUntil: { type: Date, default: null, select: false },
		lockoutCount: { type: Number, default: 0, select: false },
	});

	schema.methods.incrementLoginAttempts = async function () {
		const lockoutExpired = this.lockoutUntil && this.lockoutUntil.getTime() < Date.now();

		if (lockoutExpired) {
			return this.updateOne({ $set: { loginAttempts: 1, lockoutUntil: null } });
		}

		const durationIndex = Math.min(this.lockoutCount, LOCKOUT_DURATIONS_MS.length - 1);
		const duration = LOCKOUT_DURATIONS_MS[durationIndex];

		const updates: Updates = { $inc: { loginAttempts: 1 } };
		const willHitMaxAttempts = this.loginAttempts + 1 >= MAX_ATTEMPTS;

		if (willHitMaxAttempts) {
			updates.$set = { lockoutUntil: new Date(Date.now() + duration) };
			updates.$inc = { loginAttempts: 1, lockoutCount: 1 };
		}
		return this.updateOne(updates);
	};

	schema.methods.resetLoginAttempts = async function () {
		return this.updateOne({ $set: { loginAttempts: 0, lockoutUntil: null, lockoutCount: 0 } });
	};

	schema.methods.isAccountLocked = function (): boolean {
		return !!(this.lockoutUntil && this.lockoutUntil.getTime() > Date.now());
	};
};
