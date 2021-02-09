import express from 'express';
import { body, validationResult } from 'express-validator';
import xss from 'xss';
import { query } from './db.js';

export const router = express.Router();

// Listi af validations
const validation = [
  body('name')
    .isLength({ min: 1 })
    .withMessage('Nafn má ekki vera tómt'),
  body('name')
    .isLength({ max: 128 })
    .withMessage('Nafn má að hámarki vera 128 stafir'),
  body('nationalId')
    .isLength({ min: 1 })
    .withMessage('Kennitala má ekki vera tóm'),
  body('nationalId')
    .matches(new RegExp('^[0-9]{6}-?[0-9]{4}$'))
    .withMessage('Kennitala verður að vera á formi 000000-0000 eða 0000000000'),
  body('comment')
    .isLength({ max: 400 })
    .withMessage('Athugasemd má að hámarki vera 400 stafir'),
];

// Listi af hreinsun á gögnum
const sanitize = [
  body('name').trim().escape(),
  body('nationalId').blacklist('-'),
  body('comment').trim().escape(),
];

/**
 * Fall sem umlykur async föll og grípur villur
 * @param {function} fn er middleware sem grípa á villur fyrir
 * @returns {function} middleware með villumeðhöndlun
 */
function catchErrors(fn) {
  return (req, res, next) => fn(req, res, next).catch(next);
}

/**
 * Fall sem les úr gagnagrunni öll signatures og passar að það sé ekkert xss
 * @returns {object} hlutur sem inniheldur öll signature sem eru í gagnagrunni
 */
async function getSignatures() {
  const result = await query('SELECT * FROM signatures;');
  const { rows } = result;
  const safeRows = [];
  rows.forEach((row) => {
    // pössum að id sé örugg
    const id = xss(row.id);
    // pössum að nafnið sé öruggt
    const name = xss(row.name);
    // pössum að kennitalan sé örugg
    const nationalId = xss(row.nationalId);
    // pössum að athugasemdin sé örugg
    const comment = xss(row.comment);
    // pössum að nafleyndin sé örugg
    const anonymous = xss(row.anonymous);
    // pössum að dagsetningis sé örugg
    const date = xss(row.signed);
    const safeDate = new Date(date);
    const day = (`0${safeDate.getDate()}`).slice(-2);
    const month = (`0${safeDate.getMonth() + 1}`).slice(-2);
    const year = safeDate.getFullYear();
    const signed = `${day}.${month}.${year}`;

    // Bætum hlut við nýja örugga listan
    safeRows.push({
      id,
      name,
      nationalId,
      comment,
      anonymous,
      signed,
    });
  });
  return safeRows;
}

/**
 * Fall sem að byrtir töflu af undirskriftum
 * @param {object} req Request hlutur
 * @param {object} res Response hlutur
 */
async function form(req, res) {
  const signatures = await getSignatures();
  return res.render('index', {
    name: '',
    nationalId: '',
    comment: '',
    signatures,
    errors: [],
    errorParams: [],
  });
}

/**
 * Fall sem athugar hvort input frá notanda passi við validation reglur sem við skilgreindum
 * Höldum keyrslu áfram með next() ef all er í góðu annars birtast villuskilaboð með forminu
 * @param {object} req Request hlutur
 * @param {object} res Response hlutur
 * @param {object} next Fallið sem á að keyra næst
 */
async function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errorMessages = errors.array().map((i) => i.msg);
    const errorParams = errors.array().map((i) => i.param);
    const signatures = await getSignatures();
    return res.render('index', {
      name: req.body.name,
      nationalId: req.body.nationalId,
      comment: req.body.comment,
      signatures,
      errors: errorMessages,
      errorParams,
    });
  }
  return next();
}

/**
 * Fall sem að vistar gögnin frá notanda í gagnagrunn og passar uppá að þau eru örugg
 * @param {object} req Request hultur
 * @param {object} res Response hlutur
 */
async function saveData(req, res) {
  const data = req.body;
  let { name } = data;
  const { nationalId } = data;
  const { comment } = data;
  let anonymous = false;
  // pössum uppá að showName sé öruggt
  const showName = xss(data.showName) !== 'on';
  if (!showName) {
    name = 'Nafnlaust';
    anonymous = true;
  }
  // pössum uppá að gögnin séu örugg þegar við vistum þau, bæði uppá xss og sql injection
  const results = await query('INSERT INTO signatures (name,nationalId,comment,anonymous) VALUES ($1,$2,$3,$4)', [xss(name), xss(nationalId), xss(comment), anonymous]);
  if (!results) { // Gekk ekki upp að vista í gagnagrunn
    return res.render('couldnt');
  }
  return res.redirect('/');
}

router.get('/', catchErrors(form));
router.post(
  '/',
  // Validation rules
  validation,
  // Athugum hvort gögnin uppfylli validation reglur
  catchErrors(validate),
  // Sanitize
  sanitize,
  // Vistum gögnin í gagnagrunn
  catchErrors(saveData),
);
