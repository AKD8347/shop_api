import { Request, Response, Router } from "express";
import { connection } from "../../index";
import { v4 as uuidv4 } from 'uuid';
import { OkPacket } from "mysql2";
import { enhanceProductsComments, enhanceProductsImages, getProductsFilterQuery } from "../helpers";
import {
  ICommentEntity, ImagesRemovePayload,
  IProductEntity,
  IProductImageEntity,
  IProductSearchFilter,
  ProductAddImagesPayload,
  ProductCreatePayload
} from "../../types";
import { mapCommentsEntity, mapImagesEntity, mapProductsEntity } from "../services/mapping";
import { DELETE_IMAGES_QUERY, INSERT_PRODUCT_IMAGES_QUERY, INSERT_PRODUCT_QUERY } from "../services/queries";
import {body, param, validationResult} from 'express-validator'

export const productsRouter = Router();

const throwServerError = (res: Response, e: Error) => {
  console.debug(e.message);
  res.status(500);
  res.send("Something went wrong");
}

/**
 * Задание 34.10 – доработанный метод получения списка товаров вместе с изображениями
 */
productsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const [productRows] = await connection.query<IProductEntity[]>("SELECT * FROM products");
    const [commentRows] = await connection.query<ICommentEntity[]>("SELECT * FROM comments");
    const [imageRows] = await connection.query<IProductImageEntity[]>("SELECT * FROM images");

    const products = mapProductsEntity(productRows);
    const withComments = enhanceProductsComments(products, commentRows);
    const withImages = enhanceProductsImages(withComments, imageRows)

    res.send(withImages);
  } catch (e) {
    throwServerError(res, e);
  }
});

/**
 * Задание 34.10 – доработанный метод поиска товаров вместе с изображениями
 */
productsRouter.get('/search', async (
  req: Request<{}, {}, {}, IProductSearchFilter>,
  res: Response
) => {
  try {
    const [query, values] = getProductsFilterQuery(req.query);
    const [rows] = await connection.query<IProductEntity[]>(query, values);

    if (!rows?.length) {
      res.send([]);
      return;
    }

    const [commentRows] = await connection.query<ICommentEntity[]>("SELECT * FROM comments");
    const [imageRows] = await connection.query<IProductImageEntity[]>("SELECT * FROM images");

    const products = mapProductsEntity(rows);
    const withComments = enhanceProductsComments(products, commentRows);
    const withImages = enhanceProductsImages(withComments, imageRows)

    res.send(withImages);
  } catch (e) {
    throwServerError(res, e);
  }
});

/**
 * Задание 34.10 – доработанный метод получения товара по id вместе с изображениями
 */
productsRouter.get('/:id', async (
  req: Request<{ id: string }>,
  res: Response
) => {
  try {
    const [rows] = await connection.query<IProductEntity[]>(
      "SELECT * FROM products WHERE product_id = ?",
      [req.params.id]
    );

    if (!rows?.[0]) {
      res.status(404);
      res.send(`Product with id ${req.params.id} is not found`);
      return;
    }

    const [comments] = await connection.query<ICommentEntity[]>(
      "SELECT * FROM comments WHERE product_id = ?",
      [req.params.id]
    );

    const [images] = await connection.query<IProductImageEntity[]>(
      "SELECT * FROM images WHERE product_id = ?",
      [req.params.id]
    );

    const product = mapProductsEntity(rows)[0];

    if (comments.length) {
      product.comments = mapCommentsEntity(comments);
    }

    if (images.length) {
      product.images = mapImagesEntity(images);
      product.thumbnail = product.images.find(image => image.main) || product.images[0];
    }

    res.send(product);
  } catch (e) {
    throwServerError(res, e);
  }
});

/**
 * Задание 34.10 – доработанный метод добавления товара с добавлением изображений в соответствующую таблицу
 */
productsRouter.post('/', async (
  req: Request<{}, {}, ProductCreatePayload>,
  res: Response
) => {
  try {
    const { title, description, price, images } = req.body;
    const productId = uuidv4();
    await connection.query<OkPacket>(
      INSERT_PRODUCT_QUERY,
      [productId, title || null, description || null, price || null]
    );

    if (images) {
      const values = images.map((image) => [uuidv4(), image.url, productId, image.main]);
      await connection.query<OkPacket>(INSERT_PRODUCT_IMAGES_QUERY, [values]);
    }

    res.status(201);
    res.send(`Product id:${productId} has been added!`);
  } catch (e) {
    throwServerError(res, e);
  }
});

/**
 * Задание 34.10
 * доработанный метод удаления товара с предварительным удалением всех изображений и комментариев,
 * которые относятся к этому товару
 */
productsRouter.delete('/:id', async (
  req: Request<{ id: string }>,
  res: Response
) => {
  try {
    const [rows] = await connection.query<IProductEntity[]>(
      "SELECT * FROM products WHERE product_id = ?",
      [req.params.id]
    );

    if (!rows?.[0]) {
      res.status(404);
      res.send(`Product with id ${req.params.id} is not found`);
      return;
    }

    await connection.query<OkPacket>(
      "DELETE FROM images WHERE product_id = ?",
      [req.params.id]
    );

    await connection.query<OkPacket>(
      "DELETE FROM comments WHERE product_id = ?",
      [req.params.id]
    );

    await connection.query<OkPacket>(
      "DELETE FROM products WHERE product_id = ?",
      [req.params.id]
    );

    res.status(200);
    res.end();
  } catch (e) {
    throwServerError(res, e);
  }
});

/**
 * Задание 34.10 – добавление изображений конкретному товару
 */
productsRouter.post('/add-images', async (
  req: Request<{}, {}, ProductAddImagesPayload>,
  res: Response
) => {
  try {
    const { productId, images } = req.body;

    if (!images?.length) {
      res.status(400);
      res.send("Images array is empty");
      return;
    }

    const values = images.map((image) => [uuidv4(), image.url, productId, image.main]);
    await connection.query<OkPacket>(INSERT_PRODUCT_IMAGES_QUERY, [values]);

    res.status(201);
    res.send(`Images for a product id:${productId} have been added!`);
  } catch (e) {
    throwServerError(res, e);
  }
});

/**
 * Задание 34.10 – удаление списка изображений из таблицы images
 */
productsRouter.post('/remove-images', async (
  req: Request<{}, {}, ImagesRemovePayload>,
  res: Response
) => {
  try {
    const imagesToRemove = req.body;

    if (!imagesToRemove?.length) {
      res.status(400);
      res.send("Images array is empty");
      return;
    }

    const [info] = await connection.query<OkPacket>(DELETE_IMAGES_QUERY, [[imagesToRemove]]);

    if (info.affectedRows === 0) {
      res.status(404);
      res.send("No one image has been removed");
      return;
    }

    res.status(200);
    res.send(`Images have been removed!`);
  } catch (e) {
    throwServerError(res, e);
  }
});


productsRouter.get('/:productId/similar', async (req, res) => {
  try {
    const [productRows] = await connection.query<IProductEntity[]>(
        `
        SELECT
            p.*
        FROM product_similar ps
        JOIN products p on o.id = ps.similar_product_id
        WHERE ps.product_id = ?
        `,
        [req.params.productId]
    );

    res.json(mapProductsEntity(productRows))
  } catch (e) {
    throwServerError(res, e)
  }
})


productsRouter.put('/:productId/add-similar', body('similarProductIds').isArray(), async (req, res) => {
  try {
    const result = validationResult(req)
    if (!result.isEmpty()) {
      res.status(400).json(result.array())
      return
    }
    await connection.query(
        `
      INSERT IGNORE INTO product_similar(product_id, similar_product_id)
      VALUES ${new Array(req.body.similarProductIds.length).fill('(?, ?)').join(',\n')}
      `,
        req.body.similarProductIds.map(similarId => [req.params.productId, similarId]).flat()
    )
  } catch (e) {
    throwServerError(res, e)
  }
})

productsRouter.put('/:productId/pull-similar', body('similarProductIds').isArray(), async (req, res) => {
  try {
    const result = validationResult(req)
    if (!result.isEmpty()) {
      res.status(400).json(result.array())
      return
    }
    await connection.query(
        `
        DELETE FROM product_similar ps
        WHERE ps.product_id = ? and ps.similar_product_id in ?
      `,
        [req.params.productId, req.body.similarProductIds]
    )
  } catch (e) {
    throwServerError(res, e)
  }
})


productsRouter.put('/:productId/not-similar ', async (req, res) => {
  try {
    const [productRows] = await connection.query<IProductEntity[]>(
        `
        SELECT
            p.*
        FROM products p
        LEFT JOIN product_similar ps ON ps.product_id = p.id and ps.similar_product_id = ?
        WHERE p.id != ? and ps.id IS NULL
        `,
        [req.params.productId, req.params.productId]
    );

    res.json(mapProductsEntity(productRows))
  } catch (e) {
    throwServerError(res, e)
  }
})
