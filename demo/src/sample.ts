// Demo fixture for Undeclared Dependency Companion.
// Expected: exactly two findings -- 'totally-made-up-pkg' and 'another-ghost'.
import React from 'react';            // declared in package.json -> OK
import { helper } from '@/utils';     // tsconfig path alias -> ignored
import * as fs from 'node:fs';        // Node built-in -> ignored
import { local } from './local';      // relative path -> ignored
import x from 'totally-made-up-pkg';  // UNDECLARED -> flagged
const another = require('another-ghost'); // UNDECLARED -> flagged

export { React, helper, fs, local, x, another };
