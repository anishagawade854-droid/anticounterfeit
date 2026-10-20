// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract AntiCounterfeit {

    struct Product {
        string productId;
        string productName;
        string manufacturer;
        string batchNumber;
        string manufacturingDate;
        bool exists;
    }

    mapping(string => Product) private products;

    event ProductRegistered(
        string productId,
        string productName,
        string manufacturer
    );

    function registerProduct(
        string memory _productId,
        string memory _productName,
        string memory _manufacturer,
        string memory _batchNumber,
        string memory _manufacturingDate
    ) public {

        require(
            !products[_productId].exists,
            "Product already registered"
        );

        products[_productId] = Product(
            _productId,
            _productName,
            _manufacturer,
            _batchNumber,
            _manufacturingDate,
            true
        );

        emit ProductRegistered(
            _productId,
            _productName,
            _manufacturer
        );
    }

    function verifyProduct(
        string memory _productId
    ) public view returns (
        bool,
        string memory,
        string memory,
        string memory,
        string memory
    ) {

        Product memory product = products[_productId];

        if (!product.exists) {
            return (
                false,
                "",
                "",
                "",
                ""
            );
        }

        return (
            true,
            product.productName,
            product.manufacturer,
            product.batchNumber,
            product.manufacturingDate
        );
    }
}