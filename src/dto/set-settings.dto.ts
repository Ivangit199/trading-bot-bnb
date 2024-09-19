import { IsNotEmpty, IsNumber, Max, Min } from 'class-validator';

export class SetSettingsDto {
    @IsNotEmpty()
    @IsNumber()
    @Min(0.001)
    @Max(10)
    buyLowerLimit: number;

    @IsNotEmpty()
    @IsNumber()
    @Min(0)
    @Max(100)
    buySlippage: number;

    @IsNotEmpty()
    @IsNumber()
    @Min(0)
    @Max(100)
    buyPercentage: number;

    @IsNotEmpty()
    @IsNumber()
    @Min(0)
    @Max(100)
    sellSlippage: number;

    @IsNotEmpty()
    @IsNumber()
    @Min(0)
    @Max(100)
    sellPercentage: number;
}
