"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveWhoopSport = exports.WHOOP_SPORT_MAP = void 0;
const DEFAULT_SPORT = {
    name: 'Workout',
    category: 'General'
};
exports.WHOOP_SPORT_MAP = {
    1: { name: 'Running', category: 'Cardio' },
    2: { name: 'Cycling', category: 'Cardio' },
    3: { name: 'Swimming', category: 'Endurance' },
    8: { name: 'Rowing', category: 'Cardio' },
    9: { name: 'Weightlifting', category: 'Strength' },
    10: { name: 'CrossFit', category: 'HIIT' },
    11: { name: 'Yoga', category: 'Mobility' },
    13: { name: 'Hiking', category: 'Cardio' },
    18: { name: 'Skiing', category: 'Cardio' },
    24: { name: 'Boxing', category: 'HIIT' },
    25: { name: 'Pilates', category: 'Mobility' },
    27: { name: 'Meditation', category: 'Recovery' },
    34: { name: 'Tennis', category: 'Sport' },
    35: { name: 'Golf', category: 'Sport' },
    40: { name: 'Functional Fitness', category: 'Strength' },
    46: { name: 'Dance', category: 'Cardio' },
    52: { name: 'Walking', category: 'Cardio' },
    53: { name: 'Martial Arts', category: 'HIIT' },
    57: { name: 'Mountain Biking', category: 'Cardio' },
    62: { name: 'Rowing Machine', category: 'Cardio' },
    64: { name: 'Elliptical', category: 'Cardio' },
    67: { name: 'StairMaster', category: 'Cardio' },
    71: { name: 'Sailing', category: 'Sport' },
    73: { name: 'Strength Training', category: 'Strength' },
    74: { name: 'Track', category: 'Cardio' },
    79: { name: 'HIIT', category: 'HIIT' },
    81: { name: 'Mobility', category: 'Mobility' },
    90: { name: 'Basketball', category: 'Sport' },
    95: { name: 'Soccer', category: 'Sport' },
    96: { name: 'Baseball', category: 'Sport' },
    97: { name: 'Volleyball', category: 'Sport' },
    98: { name: 'Football', category: 'Sport' },
    99: { name: 'Hockey', category: 'Sport' }
};
const resolveWhoopSport = (input) => {
    if (input.sportName && input.sportName.trim().length > 0) {
        return {
            name: input.sportName.trim(),
            category: 'General'
        };
    }
    if (typeof input.sportTypeId === 'number' && exports.WHOOP_SPORT_MAP[input.sportTypeId]) {
        return exports.WHOOP_SPORT_MAP[input.sportTypeId];
    }
    return DEFAULT_SPORT;
};
exports.resolveWhoopSport = resolveWhoopSport;
